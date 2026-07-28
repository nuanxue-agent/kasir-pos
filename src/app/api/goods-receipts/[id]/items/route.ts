// GET/POST/PATCH /api/goods-receipts/[id]/items
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import { ensureGoodsReceiptTables } from '../../route'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

// GET /api/goods-receipts/[id]/items
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)

    const { id } = await params
    await ensureGoodsReceiptTables()

    const items = await query(
      `SELECT gri.*, p.name as productName, p.sku
       FROM GoodsReceiptItem gri
       LEFT JOIN Product p ON gri.productId = p.id
       WHERE gri.receiptId = ?
       ORDER BY gri.createdAt ASC`,
      [id]
    )
    return ok(items)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}

// POST /api/goods-receipts/[id]/items — add item to existing receipt
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)

    const { id } = await params
    await ensureGoodsReceiptTables()

    const receipt = await query(`SELECT * FROM GoodsReceipt WHERE id = ?`, [id]) as any[]
    if (receipt.length === 0) return err('Receipt not found', 404)
    if (!['PENDING', 'INSPECTING'].includes(receipt[0].status)) {
      return err('Cannot add items to a finalized receipt')
    }

    const b = (await req.json()) as any
    if (!b.productId) return err('productId required')
    if (b.receivedQty == null || b.receivedQty < 0) return err('receivedQty must be >= 0')

    const t = nowISO()
    const itemId = newId()
    await exec(
      `INSERT INTO GoodsReceiptItem (id, receiptId, storeId, productId, orderedQty, receivedQty, acceptedQty, rejectedQty, unitCost, rejectionReason, inspectionNotes, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, NULL, ?, ?, ?)`,
      [
        itemId, id, receipt[0].storeId, b.productId,
        b.orderedQty ?? 0, b.receivedQty,
        b.unitCost ?? 0, b.inspectionNotes ?? null, t, t,
      ]
    )
    return ok({ id: itemId }, 201)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}

// PATCH /api/goods-receipts/[id]/items — quality inspection: update acceptedQty/rejectedQty per item
// Body: { items: [{ id, acceptedQty, rejectedQty, rejectionReason?, inspectionNotes? }] }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)

    const { id } = await params
    await ensureGoodsReceiptTables()

    const receipt = await query(`SELECT * FROM GoodsReceipt WHERE id = ?`, [id]) as any[]
    if (receipt.length === 0) return err('Receipt not found', 404)
    if (receipt[0].status === 'ACCEPTED' || receipt[0].status === 'REJECTED') {
      return err('Cannot modify a finalized receipt')
    }

    const b = (await req.json()) as any
    if (!Array.isArray(b.items) || b.items.length === 0) return err('items array required')

    const t = nowISO()
    for (const item of b.items) {
      if (!item.id) return err('Each item must have id')

      const existing = await query(`SELECT * FROM GoodsReceiptItem WHERE id = ? AND receiptId = ?`, [item.id, id]) as any[]
      if (existing.length === 0) return err(`Item ${item.id} not found on this receipt`, 404)

      const row = existing[0]
      const acceptedQty = item.acceptedQty ?? row.acceptedQty
      const rejectedQty = item.rejectedQty ?? row.rejectedQty

      // Validate: accepted + rejected <= receivedQty
      if (acceptedQty + rejectedQty > row.receivedQty) {
        return err(`acceptedQty + rejectedQty cannot exceed receivedQty for item ${item.id}`)
      }

      const sets: string[] = ['acceptedQty = ?', 'rejectedQty = ?', 'updatedAt = ?']
      const vals: unknown[] = [acceptedQty, rejectedQty, t]

      if (item.rejectionReason !== undefined) { sets.push('rejectionReason = ?'); vals.push(item.rejectionReason) }
      if (item.inspectionNotes !== undefined) { sets.push('inspectionNotes = ?'); vals.push(item.inspectionNotes) }
      vals.push(item.id)

      await exec(`UPDATE GoodsReceiptItem SET ${sets.join(', ')} WHERE id = ?`, vals)
    }

    // Update receipt status to INSPECTING
    if (receipt[0].status === 'PENDING') {
      await exec(`UPDATE GoodsReceipt SET status = 'INSPECTING', updatedAt = ? WHERE id = ?`, [t, id])
    }

    return ok({ ok: true })
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
