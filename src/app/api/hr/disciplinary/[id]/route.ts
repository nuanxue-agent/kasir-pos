import { NextRequest, NextResponse } from 'next/server'
import { exec, nowISO } from '@/lib/db'
import { ensureDisciplinaryTable } from '../route'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    await ensureDisciplinaryTable()
    const body = await req.json() as any
    const { action } = body

    if (action === 'acknowledge') {
      const now = nowISO()
      await exec(
        `UPDATE DisciplinaryAction SET acknowledged = 1, acknowledgedAt = ?, updatedAt = ? WHERE id = ?`,
        [now, now, id],
      )
      return NextResponse.json({ ok: true, acknowledgedAt: now })
    }

    // Generic field update
    const sets: string[] = []
    const vals: any[] = []
    if (body.type !== undefined) { sets.push('type = ?'); vals.push(body.type) }
    if (body.reason !== undefined) { sets.push('reason = ?'); vals.push(body.reason) }
    if (body.description !== undefined) { sets.push('description = ?'); vals.push(body.description) }
    if (body.date !== undefined) { sets.push('date = ?'); vals.push(body.date) }
    if (body.issuedBy !== undefined) { sets.push('issuedBy = ?'); vals.push(body.issuedBy) }
    if (sets.length === 0) return err('No fields to update')
    sets.push('updatedAt = ?'); vals.push(nowISO()); vals.push(id)

    await exec(`UPDATE DisciplinaryAction SET ${sets.join(', ')} WHERE id = ?`, vals)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return err(e.message, 500)
  }
}
