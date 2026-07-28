// GET/POST /api/stock-transfers/[id]/items
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, queryOne, newId, nowISO } from '@/lib/db'
import { ensureStockTransferTables } from '../../route'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

// GET /api/stock-transfers/[id]/items
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    await ensureStockTransferTables()

    const { id } = await params
    const transfer = await queryOne(`SELECT * FROM StockTransfer WHERE id = ?`, [id]) as any
    if (!transfer) return err('Transfer not found', 404)

    const hasAccess =
      user.stores?.some((s: { id: string }) => s.id === transfer.fromStoreId || s.id === transfer.toStoreId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    const items = await query(
      `SELECT i.*, p.name as productName, p.sku
       FROM StockTransferItem i
       LEFT JOIN Product p ON p.id = i.productId
       WHERE i.transferId = ?
       ORDER BY i.createdAt ASC`,
      [id]
    ) as any[]

    return ok(items)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}

// POST /api/stock-transfers/[id]/items
// Body: { productId, requestedQty }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    await ensureStockTransferTables()

    const { id } = await params
    const transfer = await queryOne(`SELECT * FROM StockTransfer WHERE id = ?`, [id]) as any
    if (!transfer) return err('Transfer not found', 404)

    if (transfer.status !== 'DRAFT') return err('Can only add items to DRAFT transfers')

    const hasAccess =
      user.stores?.some((s: { id: string }) => s.id === transfer.fromStoreId || s.id === transfer.toStoreId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    const b = (await req.json()) as any
    if (!b.productId) return err('productId required')
    if (!b.requestedQty || b.requestedQty <= 0) return err('requestedQty must be > 0')

    const t = nowISO()
    const itemId = newId()

    await exec(
      `INSERT INTO StockTransferItem (id, transferId, productId, requestedQty, sentQty, receivedQty, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, 0, 0, ?, ?)`,
      [itemId, id, b.productId, b.requestedQty, t, t]
    )

    return ok({ id: itemId }, 201)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
