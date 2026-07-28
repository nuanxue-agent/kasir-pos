// PATCH /api/waste-entries/[id]
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, nowISO } from '@/lib/db'
import { ensureWasteTable, VALID_REASONS, VALID_SHIFTS } from '../route'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

// PATCH /api/waste-entries/[id]?storeId=
// Body: partial { qty, unit, reason, cost, shift, notes }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const { id } = await params
    const url = new URL(req.url)
    const storeId = url.searchParams.get('storeId')
    if (!storeId) return err('storeId required')

    const hasAccess = user.stores?.some((s: { id: string }) => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    await ensureWasteTable()

    const existing = await query(
      `SELECT * FROM WasteEntry WHERE id = ? AND storeId = ?`,
      [id, storeId]
    ) as any[]
    if (!existing.length) return err('Not found', 404)

    const b = (await req.json()) as any
    const fields: string[] = []
    const vals: unknown[] = []

    if (b.qty !== undefined) {
      const qty = Number(b.qty)
      if (qty <= 0) return err('qty must be > 0')
      fields.push('qty = ?'); vals.push(qty)
    }
    if (b.unit !== undefined) { fields.push('unit = ?'); vals.push(b.unit) }
    if (b.reason !== undefined) {
      if (!VALID_REASONS.includes(b.reason)) return err(`reason must be one of: ${VALID_REASONS.join(', ')}`)
      fields.push('reason = ?'); vals.push(b.reason)
    }
    if (b.cost !== undefined) {
      const cost = Number(b.cost)
      if (cost < 0) return err('cost must be >= 0')
      fields.push('cost = ?'); vals.push(cost)
    }
    if (b.shift !== undefined) {
      if (!VALID_SHIFTS.includes(b.shift)) return err(`shift must be one of: ${VALID_SHIFTS.join(', ')}`)
      fields.push('shift = ?'); vals.push(b.shift)
    }
    if (b.notes !== undefined) { fields.push('notes = ?'); vals.push(b.notes) }

    if (!fields.length) return err('No fields to update')

    fields.push('updatedAt = ?'); vals.push(nowISO())
    vals.push(id)

    await exec(`UPDATE WasteEntry SET ${fields.join(', ')} WHERE id = ?`, vals)

    const updated = await query(`SELECT * FROM WasteEntry WHERE id = ?`, [id]) as any[]
    return ok(updated[0])
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
