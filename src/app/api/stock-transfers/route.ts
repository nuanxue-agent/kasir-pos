// GET/POST /api/stock-transfers
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

export async function ensureStockTransferTables() {
  await exec(`CREATE TABLE IF NOT EXISTS StockTransfer (
    id               TEXT PRIMARY KEY,
    fromStoreId      TEXT,
    toStoreId        TEXT,
    fromWarehouseId  TEXT,
    toWarehouseId    TEXT,
    status           TEXT NOT NULL DEFAULT 'DRAFT',
    requestedBy      TEXT NOT NULL,
    approvedBy       TEXT,
    notes            TEXT,
    createdAt        TEXT NOT NULL,
    updatedAt        TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS StockTransferItem (
    id           TEXT PRIMARY KEY,
    transferId   TEXT NOT NULL,
    productId    TEXT NOT NULL,
    requestedQty REAL NOT NULL DEFAULT 0,
    sentQty      REAL NOT NULL DEFAULT 0,
    receivedQty  REAL NOT NULL DEFAULT 0,
    createdAt    TEXT NOT NULL,
    updatedAt    TEXT NOT NULL
  )`)
}

// GET /api/stock-transfers?storeId=&status=
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const url = new URL(req.url)
    const storeId = url.searchParams.get('storeId')
    if (!storeId) return err('storeId required')

    const hasAccess = user.stores?.some((s: { id: string }) => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    await ensureStockTransferTables()

    const status = url.searchParams.get('status')
    let sql = `SELECT * FROM StockTransfer WHERE (fromStoreId = ? OR toStoreId = ?)`
    const params: unknown[] = [storeId, storeId]
    if (status) { sql += ` AND status = ?`; params.push(status) }
    sql += ` ORDER BY createdAt DESC`

    const transfers = await query(sql, params) as any[]

    const enriched = await Promise.all(
      transfers.map(async (t) => {
        const rows = await query(
          `SELECT COUNT(*) as cnt, COALESCE(SUM(requestedQty),0) as totalRequested
           FROM StockTransferItem WHERE transferId = ?`,
          [t.id]
        ) as any[]
        const s = rows[0] ?? {}
        return { ...t, itemCount: s.cnt ?? 0, totalRequested: s.totalRequested ?? 0 }
      })
    )

    return ok(enriched)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}

// POST /api/stock-transfers
// Body: { storeId, toStoreId?, fromWarehouseId?, toWarehouseId?, requestedBy, notes?, items: [{productId, requestedQty}] }
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    await ensureStockTransferTables()

    const b = (await req.json()) as any
    if (!b.storeId) return err('storeId required')
    if (!b.requestedBy) return err("Field 'requestedBy' is required")
    if (!b.toStoreId && !b.toWarehouseId) return err('toStoreId or toWarehouseId required')
    if (!Array.isArray(b.items) || b.items.length === 0) return err('At least one item required')

    const hasAccess = user.stores?.some((s: { id: string }) => s.id === b.storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    for (const item of b.items) {
      if (!item.productId) return err('Each item must have productId')
      if (!item.requestedQty || item.requestedQty <= 0) return err('requestedQty must be > 0')
    }

    const t = nowISO()
    const id = newId()

    await exec(
      `INSERT INTO StockTransfer (id, fromStoreId, toStoreId, fromWarehouseId, toWarehouseId, status, requestedBy, approvedBy, notes, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, 'DRAFT', ?, NULL, ?, ?, ?)`,
      [id, b.storeId, b.toStoreId ?? null, b.fromWarehouseId ?? null, b.toWarehouseId ?? null,
       b.requestedBy, b.notes ?? null, t, t]
    )

    for (const item of b.items) {
      await exec(
        `INSERT INTO StockTransferItem (id, transferId, productId, requestedQty, sentQty, receivedQty, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, 0, 0, ?, ?)`,
        [newId(), id, item.productId, item.requestedQty, t, t]
      )
    }

    return ok({ id }, 201)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
