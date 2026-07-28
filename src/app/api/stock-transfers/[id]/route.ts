// PATCH /api/stock-transfers/[id]
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, queryOne, nowISO } from '@/lib/db'
import { ensureStockTransferTables } from '../route'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

// PATCH /api/stock-transfers/[id]
// Body: { action: 'approve'|'ship'|'receive'|'cancel', approvedBy?, items?: [{id, receivedQty}] }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    await ensureStockTransferTables()

    const { id } = await params
    const b = (await req.json()) as any
    const { action } = b

    const transfer = await queryOne(`SELECT * FROM StockTransfer WHERE id = ?`, [id]) as any
    if (!transfer) return err('Transfer not found', 404)

    const hasAccess =
      user.stores?.some((s: { id: string }) => s.id === transfer.fromStoreId || s.id === transfer.toStoreId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    const t = nowISO()

    if (action === 'approve') {
      if (transfer.status !== 'DRAFT' && transfer.status !== 'REQUESTED') {
        return err(`Cannot approve transfer in status ${transfer.status}`)
      }
      await exec(
        `UPDATE StockTransfer SET status = 'REQUESTED', approvedBy = ?, updatedAt = ? WHERE id = ?`,
        [b.approvedBy ?? (user as any).name ?? 'System', t, id]
      )
      return ok({ id, status: 'REQUESTED' })
    }

    if (action === 'ship') {
      if (transfer.status !== 'REQUESTED') {
        return err(`Cannot ship transfer in status ${transfer.status}`)
      }
      // Copy requestedQty -> sentQty
      await exec(
        `UPDATE StockTransferItem SET sentQty = requestedQty, updatedAt = ? WHERE transferId = ?`,
        [t, id]
      )
      await exec(
        `UPDATE StockTransfer SET status = 'IN_TRANSIT', updatedAt = ? WHERE id = ?`,
        [t, id]
      )
      return ok({ id, status: 'IN_TRANSIT' })
    }

    if (action === 'receive') {
      if (transfer.status !== 'IN_TRANSIT') {
        return err(`Cannot receive transfer in status ${transfer.status}`)
      }
      const items: Array<{ id: string; receivedQty: number }> = b.items ?? []
      if (!Array.isArray(items) || items.length === 0) return err('items required for receive')

      for (const item of items) {
        if (item.receivedQty == null || item.receivedQty < 0) {
          return err(`receivedQty must be >= 0 for item ${item.id}`)
        }
        await exec(
          `UPDATE StockTransferItem SET receivedQty = ?, updatedAt = ? WHERE id = ? AND transferId = ?`,
          [item.receivedQty, t, item.id, id]
        )
      }

      await exec(
        `UPDATE StockTransfer SET status = 'RECEIVED', updatedAt = ? WHERE id = ?`,
        [t, id]
      )
      return ok({ id, status: 'RECEIVED' })
    }

    if (action === 'cancel') {
      if (transfer.status !== 'DRAFT' && transfer.status !== 'REQUESTED') {
        return err(`Cannot cancel transfer in status ${transfer.status}`)
      }
      await exec(
        `UPDATE StockTransfer SET status = 'CANCELLED', updatedAt = ? WHERE id = ?`,
        [t, id]
      )
      return ok({ id, status: 'CANCELLED' })
    }

    return err(`Unknown action: ${action}`)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
