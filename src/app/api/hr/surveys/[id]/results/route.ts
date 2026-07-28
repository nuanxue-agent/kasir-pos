import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, queryOne } from '@/lib/db'
import { aggregateResponses, calcCompletionRate } from '@/lib/surveys'
import { ensureSurveyTables } from '../../route'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)

  const { id } = await params
  await ensureSurveyTables()

  const survey = (await queryOne(`SELECT * FROM Survey WHERE id = ?`, [id])) as any
  if (!survey) return err('Survey not found', 404)

  const parsedSurvey = {
    ...survey,
    anonymous: Boolean(survey.anonymous),
    questions: JSON.parse(survey.questions || '[]'),
  }

  const responseRows = (await query(
    `SELECT * FROM SurveyResponse WHERE surveyId = ? ORDER BY submittedAt ASC`,
    [id],
  )) as any[]

  const responses = responseRows.map(r => ({
    ...r,
    answers: JSON.parse(r.answers || '[]'),
  }))

  // Aggregate per question
  const aggregates = aggregateResponses(parsedSurvey, responses)

  // Trend: response count per day
  const trendMap: Record<string, number> = {}
  for (const r of responses) {
    const day = r.submittedAt.split('T')[0]
    trendMap[day] = (trendMap[day] ?? 0) + 1
  }
  const trend = Object.entries(trendMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }))

  // Total eligible employees for completion rate (from query param or fallback)
  const sp = req.nextUrl.searchParams
  const totalEmployees = parseInt(sp.get('totalEmployees') ?? '0', 10)
  const completionRate = calcCompletionRate(totalEmployees, responses.length)

  return NextResponse.json({
    surveyId: id,
    title: parsedSurvey.title,
    type: parsedSurvey.type,
    status: parsedSurvey.status,
    anonymous: parsedSurvey.anonymous,
    totalResponses: responses.length,
    completionRate,
    aggregates,
    trend,
  })
}
