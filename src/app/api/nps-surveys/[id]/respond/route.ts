// POST /api/nps-surveys/:id/respond  — public, no auth required
import { NextRequest, NextResponse } from 'next/server'
import { queryOne, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: surveyId } = await params

  const survey = await queryOne(`SELECT * FROM NpsSurvey WHERE id=?`, [surveyId]) as any
  if (!survey) return err('Survey not found', 404)
  if (!survey.active) return err('Survey is not active', 400)

  const b = (await req.json()) as any

  const score = Number(b.score)
  if (!Number.isInteger(score) || score < 0 || score > 10) {
    return err('score must be an integer between 0 and 10', 400)
  }

  const id = newId()
  await exec(
    `INSERT INTO NpsResponse (id, surveyId, storeId, customerId, orderId, score, comment, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      surveyId,
      survey.storeId,
      b.customerId ?? null,
      b.orderId ?? null,
      score,
      b.comment?.trim() ?? null,
      nowISO(),
    ],
  )
  return NextResponse.json({ id, submitted: true }, { status: 201 })
}
