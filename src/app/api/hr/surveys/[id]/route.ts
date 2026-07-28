import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, queryOne, nowISO } from '@/lib/db'
import { isValidStatusTransition, type SurveyStatus } from '@/lib/surveys'
import { ensureSurveyTables } from '../route'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)

  const { id } = await params
  await ensureSurveyTables()

  const survey = (await queryOne(`SELECT * FROM Survey WHERE id = ?`, [id])) as any
  if (!survey) return err('Survey not found', 404)

  const b = (await req.json()) as any
  const sets: string[] = []
  const vals: any[] = []

  if (b.title !== undefined)       { sets.push('title = ?');       vals.push(b.title) }
  if (b.description !== undefined) { sets.push('description = ?'); vals.push(b.description) }
  if (b.startDate !== undefined)   { sets.push('startDate = ?');   vals.push(b.startDate) }
  if (b.endDate !== undefined)     { sets.push('endDate = ?');     vals.push(b.endDate) }
  if (b.anonymous !== undefined)   { sets.push('anonymous = ?');   vals.push(b.anonymous ? 1 : 0) }

  if (b.questions !== undefined) {
    const { validateQuestions } = await import('@/lib/surveys')
    const qErr = validateQuestions(b.questions)
    if (qErr) return err(qErr)
    sets.push('questions = ?')
    vals.push(JSON.stringify(b.questions))
  }

  if (b.status !== undefined) {
    const current = survey.status as SurveyStatus
    const next    = b.status   as SurveyStatus
    if (!isValidStatusTransition(current, next)) {
      return err(`Cannot transition survey from ${current} to ${next}`, 400)
    }
    sets.push('status = ?')
    vals.push(next)
  }

  if (sets.length === 0) return err('No fields to update')

  sets.push('updatedAt = ?')
  vals.push(nowISO())
  vals.push(id)

  await exec(`UPDATE Survey SET ${sets.join(', ')} WHERE id = ?`, vals)
  return NextResponse.json({ ok: true })
}
