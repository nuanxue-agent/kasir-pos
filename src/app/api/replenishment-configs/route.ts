// GET /api/replenishment-configs?storeId=
// POST /api/replenishment-configs?storeId=
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function ensureReplenishmentTables() {
  await exec(`CREATE TABLE IF NOT EXISTS ReplenishmentConfig (
    id            TEXT PRIMARY KEY,
    storeId       TEXT NOT NULL,
    productId     TEXT NOT NULL,
    vendorId      TEXT,
    minStock      REAL NOT NULL DEFAULT 0,
    maxStock      REAL NOT NULL DEFAULT 0,
    reorderPoint  REAL NOT NULL DEFAULT 0,
    leadTimeDays  INTEGER NOT NULL DEFAULT 7,
    safetyStock   REAL NOT NULL DEFAULT 0,
    active        INTEGER NOT NULL DEFAULT 1,
    createdAt     TEXT NOT NULL,
    updatedAt     TEXT NOT NULL
  )`)

  await exec(`CREATE TABLE IF NOT EXISTS ReplenishmentSuggestion (
    id              TEXT PRIMARY KEY,
    storeId         TEXT NOT NULL,
    productId       TEXT NOT NULL,
    vendorId        TEXT,
    suggestedQty    REAL NOT NULL DEFAULT 0,
    urgency         TEXT NOT NULL DEFAULT 'LOW',
    currentStock    REAL NOT NULL DEFAULT 0,
    expectedStockout TEXT,
    createdAt       TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'PENDING'
  )`)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureReplenishmentTables()

  const rows = await query(`
    SELECT
      rc.*,
      p.name  AS productName,
      p.sku   AS sku,
      p.stock AS currentStock,
      v.name  AS vendorName
    FROM ReplenishmentConfig rc
    LEFT JOIN Product p ON rc.productId = p.id
    LEFT JOIN Vendor  v ON rc.vendorId   = v.id
    WHERE rc.storeId = ?
    ORDER BY p.name ASC
  `, [storeId])

  const items = (rows as any[]).map(row => ({ ...row, active: Boolean(row.active) }))
  return NextResponse.json(items)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureReplenishmentTables()

  const b = (await req.json()) as any
  if (!b.productId)        return err("Field 'productId' is required",    400, 'MISSING_FIELD')
  if (b.minStock === undefined) return err("Field 'minStock' is required", 400, 'MISSING_FIELD')
  if (b.maxStock === undefined) return err("Field 'maxStock' is required", 400, 'MISSING_FIELD')
  if (b.reorderPoint === undefined) return err("Field 'reorderPoint' is required", 400, 'MISSING_FIELD')

  // No duplicate configs per product/store
  const existing = await query(
    `SELECT id FROM ReplenishmentConfig WHERE storeId = ? AND productId = ?`,
    [storeId, b.productId]
  )
  if ((existing as any[]).length > 0) {
    return err('Konfigurasi pengadaan sudah ada untuk produk ini', 400, 'DUPLICATE')
  }

  const t = nowISO()
  const id = newId()

  await exec(
    `INSERT INTO ReplenishmentConfig
       (id, storeId, productId, vendorId, minStock, maxStock, reorderPoint, leadTimeDays, safetyStock, active, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, storeId, b.productId,
      b.vendorId ?? null,
      b.minStock, b.maxStock, b.reorderPoint,
      b.leadTimeDays ?? 7,
      b.safetyStock ?? 0,
      1, t, t,
    ]
  )

  return NextResponse.json({ id }, { status: 201 })
}
