import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, nowISO } from '@/lib/db'
import { ensurePOTables } from '../../route'
import { canReceiveGoods, isFullyReceived, isPartiallyReceived } from '@/lib/purchase-orders'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
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

  if (!canReceiveGoods(po.status)) {
    return err(`Cannot receive goods on a PO with status ${po.status}`, 400, 'INVALID_STATE')
  }

  const b = (await req.json()) as any
  // lines: [{ id: string, receivedQty: number }]
  if (!Array.isArray(b.lines) || b.lines.length === 0) {
    return err('lines required', 400, 'MISSING_FIELD')
  }

  // Load current items
  const itemRows = await query(`SELECT * FROM PurchaseOrderItem WHERE poId = ?`, [id]) as any[]

  // Validate all lines first
  for (const rl of b.lines) {
    const item = itemRows.find((i: any) => i.id === rl.id)
    if (!item) return err(`Item ${rl.id} not found on this PO`, 400, 'NOT_FOUND')
    if (!rl.receivedQty || Number(rl.receivedQty) <= 0) {
      return err('receivedQty must be > 0', 400, 'MISSING_FIELD')
    }
    const remaining = Number(item.qty) - Number(item.receivedQty)
    if (Number(rl.receivedQty) > remaining) {
      return err(`receivedQty exceeds remaining qty on item ${rl.id}`, 400, 'EXCEEDS_QTY')
    }
  }

  const t = nowISO()

  // Apply receives and update stock
  for (const rl of b.lines) {
    const item = itemRows.find((i: any) => i.id === rl.id) as any
    const newReceivedQty = Number(item.receivedQty) + Number(rl.receivedQty)
    await exec(
      `UPDATE PurchaseOrderItem SET receivedQty = ? WHERE id = ?`,
      [newReceivedQty, rl.id]
    )
    // Update product stock
    await exec(
      `UPDATE Product SET stock = COALESCE(stock, 0) + ?, updatedAt = ? WHERE id = ? AND storeId = ?`,
      [Number(rl.receivedQty), t, item.productId, po.storeId]
    ).catch(() => {}) // Product may not exist — graceful fallback
  }

  // Reload items to derive new PO status
  const updatedItems = await query(`SELECT * FROM PurchaseOrderItem WHERE poId = ?`, [id]) as any[]
  const mapped = updatedItems.map((i: any) => ({
    id: i.id, poId: i.poId, storeId: i.storeId, productId: i.productId,
    qty: Number(i.qty), unitPrice: Number(i.unitPrice), total: Number(i.total),
    receivedQty: Number(i.receivedQty),
  }))

  let newStatus: string = po.status
  if (isFullyReceived(mapped)) {
    newStatus = 'RECEIVED'
  } else if (isPartiallyReceived(mapped)) {
    newStatus = 'PARTIAL'
  }

  await exec(
    `UPDATE PurchaseOrder SET status = ?, updatedAt = ? WHERE id = ?`,
    [newStatus, t, id]
  )

  return NextResponse.json({ ok: true, status: newStatus, itemsUpdated: b.lines.length })
}
