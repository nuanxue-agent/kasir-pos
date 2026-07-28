// POST /api/goods-receipts/[id]/accept — finalize receipt and update stock
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, nowISO } from '@/lib/db'
import { ensureGoodsReceiptTables } from '../../route'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)

    const { id } = await params
    await ensureGoodsReceiptTables()

    const rows = await query(`SELECT * FROM GoodsReceipt WHERE id = ?`, [id]) as any[]
    if (rows.length === 0) return err('Receipt not found', 404)
    const receipt = rows[0]

    if (receipt.status === 'ACCEPTED' || receipt.status === 'REJECTED') {
      return err('Receipt is already finalized')
    }

    const items = await query(
      `SELECT * FROM GoodsReceiptItem WHERE receiptId = ?`,
      [id]
    ) as any[]

    if (items.length === 0) return err('No items on this receipt')

    // Determine final status: all rejected → REJECTED, all accepted → ACCEPTED, mix → PARTIAL
    const totalAccepted = items.reduce((s: number, i: any) => s + (i.acceptedQty ?? 0), 0)
    const totalRejected = items.reduce((s: number, i: any) => s + (i.rejectedQty ?? 0), 0)
    const totalReceived = items.reduce((s: number, i: any) => s + (i.receivedQty ?? 0), 0)

    // If no inspection has been done yet, auto-accept all received qty
    const needsAutoAccept = items.every((i: any) => i.acceptedQty === 0 && i.rejectedQty === 0)
    const t = nowISO()

    if (needsAutoAccept) {
      // Auto-accept: acceptedQty = receivedQty
      for (const item of items) {
        await exec(
          `UPDATE GoodsReceiptItem SET acceptedQty = receivedQty, updatedAt = ? WHERE id = ?`,
          [t, item.id]
        )
      }
    }

    // Re-read after potential auto-accept
    const finalItems = needsAutoAccept
      ? items.map((i: any) => ({ ...i, acceptedQty: i.receivedQty, rejectedQty: 0 }))
      : items

    const finalAccepted = finalItems.reduce((s: number, i: any) => s + (i.acceptedQty ?? 0), 0)
    const finalRejected = finalItems.reduce((s: number, i: any) => s + (i.rejectedQty ?? 0), 0)

    let finalStatus: string
    if (finalAccepted === 0) {
      finalStatus = 'REJECTED'
    } else if (finalRejected === 0) {
      finalStatus = 'ACCEPTED'
    } else {
      finalStatus = 'PARTIAL'
    }

    // Update stock for accepted items
    let stockUpdates = 0
    for (const item of finalItems) {
      const accepted = item.acceptedQty ?? 0
      if (accepted > 0) {
        await exec(
          `UPDATE Product SET stock = COALESCE(stock, 0) + ?, updatedAt = ? WHERE id = ?`,
          [accepted, t, item.productId]
        )
        stockUpdates++
      }
    }

    // Finalize receipt status
    await exec(
      `UPDATE GoodsReceipt SET status = ?, updatedAt = ? WHERE id = ?`,
      [finalStatus, t, id]
    )

    return ok({
      ok: true,
      status: finalStatus,
      totalAccepted: finalAccepted,
      totalRejected: finalRejected,
      totalReceived,
      stockUpdates,
    })
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
