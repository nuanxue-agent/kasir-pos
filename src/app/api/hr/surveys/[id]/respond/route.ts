import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, queryOne, newId, nowISO } from '@/lib/db'
import { isSurveyOpen, sanitizeResponseForAnonymous } from '@/lib/surveys'
import { ensureSurveyTables } from '../../route'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)
  const user = session.user as any

  const { id } = await params
  await ensureSurveyTables()

  const survey = (await queryOne(`SELECT * FROM Survey WHERE id = ?`, [id])) as any
  if (!survey) return err('Survey not found', 404)

  const parsedSurvey = {
    ...survey,
    anonymous: Boolean(survey.anonymous),
    questions: JSON.parse(survey.questions || '[]'),
  }

  if (!isSurveyOpen(parsedSurvey)) {
    return err('Survey is not currently open for responses', 400)
  }

  const storeId = survey.storeId as string

  // Prevent duplicate responses (per employee, per survey)
  const employeeId: string = user.employeeId ?? user.id ?? 'unknown'
  if (!parsedSurvey.anonymous) {
    const existing = await query(
      `SELECT id FROM SurveyResponse WHERE surveyId = ? AND employeeId = ?`,
      [id, employeeId],
    )
    if ((existing as any[]).length > 0) {
      return err('You have already submitted a response to this survey', 409)
    }
  }

  const b = (await req.json()) as any
  if (!Array.isArray(b.answers)) return err('answers must be an array')

  const responseId = newId()
  const submittedAt = nowISO()

  let responseObj = {
    id: responseId,
    surveyId: id,
    employeeId,
    storeId,
    answers: b.answers,
    submittedAt,
  }
  responseObj = sanitizeResponseForAnonymous(responseObj, parsedSurvey.anonymous)

  await exec(
    `INSERT INTO SurveyResponse (id, surveyId, employeeId, storeId, answers, submittedAt)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [responseObj.id, responseObj.surveyId, responseObj.employeeId, responseObj.storeId,
     JSON.stringify(responseObj.answers), responseObj.submittedAt],
  )

  return NextResponse.json({ id: responseId }, { status: 201 })
}
