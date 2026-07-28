import { NextRequest, NextResponse } from 'next/server'
import { query, exec, nowISO } from '@/lib/db'
import { ensureNPSTables } from '../route'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await ensureNPSTables()
    const { id } = await params
    const body = await req.json() as any
    const { name, question, active, triggerType } = body

    const [existing] = await query(`SELECT * FROM NPSSurvey WHERE id = ?`, [id])
    if (!existing) return err('Survey not found', 404)

    const VALID_TRIGGERS = ['POST_PURCHASE', 'MANUAL', 'SCHEDULED']
    if (triggerType !== undefined && !VALID_TRIGGERS.includes(triggerType)) {
      return err(`triggerType must be one of: ${VALID_TRIGGERS.join(', ')}`)
    }

    const updates: string[] = []
    const vals: any[] = []

    if (name !== undefined)        { updates.push('name = ?');        vals.push(name) }
    if (question !== undefined)    { updates.push('question = ?');    vals.push(question) }
    if (active !== undefined)      { updates.push('active = ?');      vals.push(active ? 1 : 0) }
    if (triggerType !== undefined) { updates.push('triggerType = ?'); vals.push(triggerType) }

    if (updates.length === 0) return err('No fields to update')

    updates.push('updatedAt = ?')
    vals.push(nowISO())
    vals.push(id)

    await exec(
      `UPDATE NPSSurvey SET ${updates.join(', ')} WHERE id = ?`,
      vals,
    )

    const [row] = await query(`SELECT * FROM NPSSurvey WHERE id = ?`, [id])
    return NextResponse.json({ data: row })
  } catch (e: any) {
    return err(e.message, 500)
  }
}
