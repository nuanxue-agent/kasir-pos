// PATCH /api/rtv-orders/[id]
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, nowISO } from '@/lib/db'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

type RTVStatus = 'DRAFT' | 'SUBMITTED' | 'ACKNOWLEDGED' | 'SHIPPED' | 'COMPLETED' | 'CANCELLED'

const VALID_TRANSITIONS: Record<RTVStatus, RTVStatus[]> = {
  DRAFT:        ['SUBMITTED', 'CANCELLED'],
  SUBMITTED:    ['ACKNOWLEDGED', 'CANCELLED'],
  ACKNOWLEDGED: ['SHIPPED', 'CANCELLED'],
  SHIPPED:      ['COMPLETED', 'CANCELLED'],
  COMPLETED:    [],
  CANCELLED:    [],
}

// PATCH /api/rtv-orders/[id]
// Body: { status?, notes?, creditNote? }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const { id } = await params

    const rows = await query(`SELECT * FROM RTVOrder WHERE id = ?`, [id]) as any[]
    if (rows.length === 0) return err('RTV order not found', 404)
    const order = rows[0]

    const hasAccess = user.stores?.some((s: { id: string }) => s.id === order.storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    const b = (await req.json()) as any
    const updates: string[] = []
    const vals: unknown[] = []

    if (b.status !== undefined) {
      const current = order.status as RTVStatus
      const next = b.status as RTVStatus
      const allowed = VALID_TRANSITIONS[current] ?? []
      if (!allowed.includes(next)) {
        return err(`Cannot transition from ${current} to ${next}`)
      }
      updates.push('status = ?'); vals.push(next)
    }
    if (b.notes !== undefined) { updates.push('notes = ?'); vals.push(b.notes) }
    if (b.creditNote !== undefined) { updates.push('creditNote = ?'); vals.push(b.creditNote) }

    if (updates.length === 0) return err('No fields to update')

    updates.push('updatedAt = ?'); vals.push(nowISO())
    vals.push(id)

    await exec(`UPDATE RTVOrder SET ${updates.join(', ')} WHERE id = ?`, vals)

    const updated = await query(`SELECT * FROM RTVOrder WHERE id = ?`, [id]) as any[]
    return ok(updated[0])
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
