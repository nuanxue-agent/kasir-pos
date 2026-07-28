// PATCH /api/lots/[id]
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, nowISO } from '@/lib/db'
import { isValidStatusTransition, deriveStatus } from '@/lib/lot-tracking'
import type { LotStatus } from '@/lib/lot-tracking'
import { ensureLotTable } from '../route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')

  await ensureLotTable()

  const rows = await query(`SELECT * FROM Lot WHERE id = ?`, [id])
  const lot = (rows as any[])[0]
  if (!lot) return err('Lot not found', 404, 'NOT_FOUND')

  const b = (await req.json()) as any

  const sets: string[] = []
  const vals: any[]    = []

  if (b.lotNumber !== undefined)  { sets.push('lotNumber = ?');   vals.push(b.lotNumber) }
  if (b.expiryDate !== undefined) { sets.push('expiryDate = ?');  vals.push(b.expiryDate) }
  if (b.receivedDate !== undefined) { sets.push('receivedDate = ?'); vals.push(b.receivedDate) }
  if (b.supplierId !== undefined) { sets.push('supplierId = ?');  vals.push(b.supplierId) }
  if (b.costPerUnit !== undefined) { sets.push('costPerUnit = ?'); vals.push(Number(b.costPerUnit)) }

  if (b.remainingQty !== undefined) {
    const rq = Number(b.remainingQty)
    if (rq < 0) return err("'remainingQty' must be non-negative", 400, 'INVALID_FIELD')
    sets.push('remainingQty = ?')
    vals.push(rq)

    // Auto-derive status if not explicitly provided
    if (b.status === undefined) {
      const newStatus = deriveStatus({
        remainingQty: rq,
        expiryDate: b.expiryDate ?? lot.expiryDate,
      })
      sets.push('status = ?')
      vals.push(newStatus)
    }
  }

  if (b.status !== undefined) {
    const currentStatus = lot.status as LotStatus
    const newStatus     = b.status  as LotStatus
    if (!isValidStatusTransition(currentStatus, newStatus)) {
      return err(`Cannot transition from ${currentStatus} to ${newStatus}`, 400, 'INVALID_TRANSITION')
    }
    // Remove auto-derived status if it was already pushed above
    const autoIdx = sets.indexOf('status = ?')
    if (autoIdx !== -1) { sets.splice(autoIdx, 1); vals.splice(autoIdx, 1) }
    sets.push('status = ?')
    vals.push(newStatus)
  }

  if (sets.length === 0) return err('No fields to update', 400, 'NO_FIELDS')

  sets.push('updatedAt = ?')
  vals.push(nowISO())
  vals.push(id)

  await exec(`UPDATE Lot SET ${sets.join(', ')} WHERE id = ?`, vals)
  return NextResponse.json({ ok: true })
}
