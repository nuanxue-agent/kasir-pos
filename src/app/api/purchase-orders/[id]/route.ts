import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, nowISO } from '@/lib/db'
import { ensurePOTables } from '../route'
import { isValidStatusTransition } from '@/lib/purchase-orders'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')

  await ensurePOTables()

  const rows = await query(`SELECT * FROM PurchaseOrder WHERE id = ?`, [id]) as any[]
  if (rows.length === 0) return err('Not found', 404, 'NOT_FOUND')
  const po = rows[0]

  const items = await query(`SELECT * FROM PurchaseOrderItem WHERE poId = ? ORDER BY rowid ASC`, [id])
  return NextResponse.json({ ...po, items })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')

  await ensurePOTables()

  const rows = await query(`SELECT * FROM PurchaseOrder WHERE id = ?`, [id]) as any[]
  if (rows.length === 0) return err('Not found', 404, 'NOT_FOUND')
  const existing = rows[0] as any

  const b = (await req.json()) as any

  // Validate status transition if provided
  if (b.status !== undefined && b.status !== existing.status) {
    if (!isValidStatusTransition(existing.status, b.status)) {
      return err(`Cannot transition from ${existing.status} to ${b.status}`, 400, 'INVALID_TRANSITION')
    }
  }

  const sets: string[] = []
  const vals: any[] = []

  if (b.vendorId   !== undefined) { sets.push('vendorId = ?');    vals.push(b.vendorId) }
  if (b.status     !== undefined) { sets.push('status = ?');      vals.push(b.status) }
  if (b.orderDate  !== undefined) { sets.push('orderDate = ?');   vals.push(b.orderDate) }
  if (b.expectedDate !== undefined) { sets.push('expectedDate = ?'); vals.push(b.expectedDate) }
  if (b.subtotal   !== undefined) { sets.push('subtotal = ?');    vals.push(Number(b.subtotal)) }
  if (b.taxAmount  !== undefined) { sets.push('taxAmount = ?');   vals.push(Number(b.taxAmount)) }
  if (b.total      !== undefined) { sets.push('total = ?');       vals.push(Number(b.total)) }
  if (b.notes      !== undefined) { sets.push('notes = ?');       vals.push(b.notes) }

  if (sets.length === 0) return err('No fields to update', 400, 'NO_FIELDS')

  sets.push('updatedAt = ?')
  vals.push(nowISO())
  vals.push(id)

  await exec(`UPDATE PurchaseOrder SET ${sets.join(', ')} WHERE id = ?`, vals)
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')

  await ensurePOTables()

  const rows = await query(`SELECT status FROM PurchaseOrder WHERE id = ?`, [id]) as any[]
  if (rows.length === 0) return err('Not found', 404, 'NOT_FOUND')
  if (rows[0].status !== 'DRAFT') return err('Only DRAFT orders can be deleted', 400, 'INVALID_STATE')

  await exec(`DELETE FROM PurchaseOrderItem WHERE poId = ?`, [id])
  await exec(`DELETE FROM PurchaseOrder WHERE id = ?`, [id])
  return NextResponse.json({ ok: true })
}
