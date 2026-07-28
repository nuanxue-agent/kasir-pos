import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, nowISO } from '@/lib/db'
import { ensureCashFlowTables } from '../route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

// PATCH /api/cash-flow-entries/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
    const user = session.user as any

    const { id } = await params

    await ensureCashFlowTables()

    const rows = await query(`SELECT * FROM CashFlowEntry WHERE id = ?`, [id]) as any[]
    if (rows.length === 0) return err('Entry not found', 404, 'NOT_FOUND')
    const entry = rows[0]

    const hasAccess = user.stores?.some((s: { id: string }) => s.id === entry.storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403, 'FORBIDDEN')

    const b = (await req.json()) as any

    const sets: string[] = []
    const vals: unknown[] = []

    if (b.category !== undefined) {
      if (!['OPERATING', 'INVESTING', 'FINANCING'].includes(b.category)) {
        return err("category must be OPERATING, INVESTING, or FINANCING", 400, 'INVALID_FIELD')
      }
      sets.push('category = ?'); vals.push(b.category)
    }
    if (b.type !== undefined) {
      if (!['INFLOW', 'OUTFLOW'].includes(b.type)) {
        return err("type must be INFLOW or OUTFLOW", 400, 'INVALID_FIELD')
      }
      sets.push('type = ?'); vals.push(b.type)
    }
    if (b.description !== undefined) { sets.push('description = ?'); vals.push(b.description) }
    if (b.amount !== undefined) {
      const amount = parseFloat(b.amount)
      if (isNaN(amount) || amount < 0) return err("amount must be a non-negative number", 400, 'INVALID_FIELD')
      sets.push('amount = ?'); vals.push(amount)
    }
    if (b.period !== undefined) { sets.push('period = ?'); vals.push(b.period) }
    if (b.reference !== undefined) { sets.push('reference = ?'); vals.push(b.reference) }

    if (sets.length === 0) return err('No fields to update', 400, 'NO_FIELDS')

    vals.push(id)
    await exec(`UPDATE CashFlowEntry SET ${sets.join(', ')} WHERE id = ?`, vals)

    const updated = await query(`SELECT * FROM CashFlowEntry WHERE id = ?`, [id]) as any[]
    return NextResponse.json(updated[0])
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500, 'INTERNAL')
  }
}
