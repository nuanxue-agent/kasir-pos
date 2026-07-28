import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import { ensurePOTables } from '../../route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

async function recalcPOTotals(poId: string) {
  const itemRows = await query(`SELECT total FROM PurchaseOrderItem WHERE poId = ?`, [poId]) as any[]
  const subtotal = itemRows.reduce((s: number, r: any) => s + Number(r.total), 0)
  // Keep existing taxAmount, just update subtotal + total
  const poRows = await query(`SELECT taxAmount FROM PurchaseOrder WHERE id = ?`, [poId]) as any[]
  const taxAmount = poRows.length > 0 ? Number(poRows[0].taxAmount) : 0
  await exec(
    `UPDATE PurchaseOrder SET subtotal = ?, total = ?, updatedAt = ? WHERE id = ?`,
    [subtotal, subtotal + taxAmount, nowISO(), poId]
  )
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')

  await ensurePOTables()

  const poRows = await query(`SELECT id FROM PurchaseOrder WHERE id = ?`, [id]) as any[]
  if (poRows.length === 0) return err('PO not found', 404, 'NOT_FOUND')

  const items = await query(
    `SELECT poi.*, p.name as productName, p.sku
     FROM PurchaseOrderItem poi
     LEFT JOIN Product p ON poi.productId = p.id
     WHERE poi.poId = ?
     ORDER BY poi.rowid ASC`,
    [id]
  ).catch(() =>
    query(`SELECT * FROM PurchaseOrderItem WHERE poId = ? ORDER BY rowid ASC`, [id])
  )

  return NextResponse.json(items)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')

  await ensurePOTables()

  const poRows = await query(`SELECT * FROM PurchaseOrder WHERE id = ?`, [id]) as any[]
  if (poRows.length === 0) return err('PO not found', 404, 'NOT_FOUND')
  const po = poRows[0] as any
  if (po.status !== 'DRAFT') return err('Items can only be added to DRAFT orders', 400, 'INVALID_STATE')

  const b = (await req.json()) as any
  if (!b.productId) return err('productId required', 400, 'MISSING_FIELD')
  if (!b.qty || Number(b.qty) <= 0) return err('qty must be > 0', 400, 'MISSING_FIELD')
  if (b.unitPrice === undefined || Number(b.unitPrice) < 0) return err('unitPrice required', 400, 'MISSING_FIELD')

  const qty = Number(b.qty)
  const unitPrice = Number(b.unitPrice)
  const total = qty * unitPrice
  const itemId = newId()

  await exec(
    `INSERT INTO PurchaseOrderItem (id, poId, storeId, productId, qty, unitPrice, total, receivedQty)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
    [itemId, id, po.storeId, b.productId, qty, unitPrice, total]
  )

  await recalcPOTotals(id)

  return NextResponse.json({ id: itemId }, { status: 201 })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')

  await ensurePOTables()

  const poRows = await query(`SELECT status, storeId FROM PurchaseOrder WHERE id = ?`, [id]) as any[]
  if (poRows.length === 0) return err('PO not found', 404, 'NOT_FOUND')
  if (poRows[0].status !== 'DRAFT') return err('Items can only be removed from DRAFT orders', 400, 'INVALID_STATE')

  const sp = req.nextUrl.searchParams
  const itemId = sp.get('itemId')
  if (!itemId) return err('itemId query param required', 400, 'MISSING_FIELD')

  await exec(`DELETE FROM PurchaseOrderItem WHERE id = ? AND poId = ?`, [itemId, id])
  await recalcPOTotals(id)

  return NextResponse.json({ ok: true })
}
