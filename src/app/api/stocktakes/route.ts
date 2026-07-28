// GET  /api/stocktakes?storeId=
// POST /api/stocktakes?storeId=
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function ensureStocktakeTables() {
  await exec(`CREATE TABLE IF NOT EXISTS Stocktake (
    id          TEXT PRIMARY KEY,
    storeId     TEXT NOT NULL,
    warehouseId TEXT,
    name        TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'DRAFT',
    startedAt   TEXT NOT NULL,
    completedAt TEXT,
    completedBy TEXT,
    notes       TEXT,
    createdAt   TEXT NOT NULL,
    updatedAt   TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS StocktakeItem (
    id          TEXT PRIMARY KEY,
    stocktakeId TEXT NOT NULL,
    productId   TEXT NOT NULL,
    systemQty   REAL NOT NULL DEFAULT 0,
    countedQty  REAL,
    variance    REAL NOT NULL DEFAULT 0,
    notes       TEXT,
    createdAt   TEXT NOT NULL,
    updatedAt   TEXT NOT NULL
  )`)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureStocktakeTables()

  const rows = await query(
    `SELECT s.*,
       (SELECT COUNT(*) FROM StocktakeItem si WHERE si.stocktakeId = s.id) AS itemCount
     FROM Stocktake s
     WHERE s.storeId = ?
     ORDER BY s.startedAt DESC`,
    [storeId],
  )

  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureStocktakeTables()

  const b = (await req.json()) as any
  if (!b.name) return err("Field 'name' is required", 400, 'MISSING_FIELD')

  const t = nowISO()
  const id = newId()

  await exec(
    `INSERT INTO Stocktake (id, storeId, warehouseId, name, status, startedAt, completedAt, completedBy, notes, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, 'DRAFT', ?, NULL, NULL, ?, ?, ?)`,
    [id, storeId, b.warehouseId ?? null, b.name, b.startedAt ?? t, b.notes ?? null, t, t],
  )

  // Seed items from current stock — join Product with its stock qty
  const warehouseFilter = b.warehouseId
    ? `AND (p.warehouseId = ? OR p.warehouseId IS NULL)`
    : ''
  const stockRows = await query(
    `SELECT p.id AS productId, COALESCE(p.stock, 0) AS systemQty
     FROM Product p
     WHERE p.storeId = ? AND (p.active = 1 OR p.active IS NULL)
     ${warehouseFilter}
     ORDER BY p.name ASC`,
    b.warehouseId ? [storeId, b.warehouseId] : [storeId],
  )

  for (const row of stockRows as any[]) {
    const itemId = newId()
    await exec(
      `INSERT INTO StocktakeItem (id, stocktakeId, productId, systemQty, countedQty, variance, notes, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, NULL, 0, NULL, ?, ?)`,
      [itemId, id, row.productId, row.systemQty, t, t],
    )
  }

  const [created] = await query(`SELECT * FROM Stocktake WHERE id = ?`, [id])
  const items = await query(
    `SELECT si.*, p.name AS productName, p.sku AS productSku
     FROM StocktakeItem si
     JOIN Product p ON p.id = si.productId
     WHERE si.stocktakeId = ?
     ORDER BY p.name ASC`,
    [id],
  )

  return NextResponse.json({ ...(created as object), items }, { status: 201 })
}
