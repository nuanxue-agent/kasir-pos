import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, nowISO } from '@/lib/db'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const { id } = await params

    const existing = await query(`SELECT * FROM StoreTarget WHERE id = ?`, [id]) as any[]
    if (!existing.length) return err('Not found', 404)

    const target = existing[0]
    const hasAccess = (user.stores ?? []).some((s: { id: string }) => s.id === target.storeId)
    if (!hasAccess) return err('Forbidden', 403)

    const body = await req.json() as any
    const fields: string[] = []
    const vals:   any[]    = []

    if (typeof body.targetValue === 'number') {
      if (body.targetValue < 0) return err('targetValue must be non-negative')
      fields.push('targetValue = ?'); vals.push(body.targetValue)
    }
    if (typeof body.actualValue === 'number') {
      if (body.actualValue < 0) return err('actualValue must be non-negative')
      fields.push('actualValue = ?'); vals.push(body.actualValue)
    }
    if (body.period) {
      fields.push('period = ?'); vals.push(body.period)
    }

    if (fields.length === 0) return err('No fields to update')

    fields.push('updatedAt = ?'); vals.push(nowISO())
    vals.push(id)

    await exec(`UPDATE StoreTarget SET ${fields.join(', ')} WHERE id = ?`, vals)

    const updated = await query(`SELECT * FROM StoreTarget WHERE id = ?`, [id]) as any[]
    return ok(updated[0])
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500)
  }
}
