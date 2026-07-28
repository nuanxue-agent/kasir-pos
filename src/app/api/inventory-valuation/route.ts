import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec } from '@/lib/db'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

export async function ensureValuationTables() {
  await exec(`CREATE TABLE IF NOT EXISTS ValuationMethod (
    id        TEXT PRIMARY KEY,
    storeId   TEXT NOT NULL,
    method    TEXT NOT NULL DEFAULT 'FIFO',
    active    INTEGER NOT NULL DEFAULT 1,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS InventoryLayer (
    id           TEXT PRIMARY KEY,
    storeId      TEXT NOT NULL,
    productId    TEXT NOT NULL,
    qty          REAL NOT NULL DEFAULT 0,
    costPrice    REAL NOT NULL DEFAULT 0,
    remainingQty REAL NOT NULL DEFAULT 0,
    receivedAt   TEXT NOT NULL,
    method       TEXT NOT NULL DEFAULT 'FIFO',
    createdAt    TEXT NOT NULL,
    updatedAt    TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS COGSEntry (
    id        TEXT PRIMARY KEY,
    storeId   TEXT NOT NULL,
    productId TEXT NOT NULL,
    qty       REAL NOT NULL DEFAULT 0,
    costPrice REAL NOT NULL DEFAULT 0,
    totalCost REAL NOT NULL DEFAULT 0,
    orderId   TEXT,
    soldAt    TEXT NOT NULL,
    createdAt TEXT NOT NULL
  )`)
}

// GET /api/inventory-valuation?storeId=&method=FIFO
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

    await ensureValuationTables()

    const method = url.searchParams.get('method') ?? 'FIFO'

    const rows = await query(
      `SELECT
         il.productId,
         COALESCE(p.name, il.productId) AS productName,
         il.method,
         SUM(il.remainingQty) AS totalQty,
         SUM(il.remainingQty * il.costPrice) AS totalValue,
         CASE WHEN SUM(il.remainingQty) > 0
              THEN SUM(il.remainingQty * il.costPrice) / SUM(il.remainingQty)
              ELSE 0 END AS avgCost
       FROM InventoryLayer il
       LEFT JOIN Product p ON p.id = il.productId
       WHERE il.storeId = ? AND il.method = ? AND il.remainingQty > 0
       GROUP BY il.productId, il.method
       ORDER BY totalValue DESC`,
      [storeId, method]
    ) as any[]

    return ok(rows)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
