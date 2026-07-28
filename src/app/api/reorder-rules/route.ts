// GET /api/reorder-rules?storeId=&active=
// POST /api/reorder-rules?storeId=
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function ensureReorderTables() {
  await exec(`CREATE TABLE IF NOT EXISTS ReorderRule (
    id                TEXT PRIMARY KEY,
    storeId           TEXT NOT NULL,
    productId         TEXT NOT NULL,
    reorderPoint      REAL NOT NULL DEFAULT 0,
    reorderQty        REAL NOT NULL DEFAULT 0,
    leadTimeDays      INTEGER NOT NULL DEFAULT 0,
    preferredVendorId TEXT,
    active            INTEGER NOT NULL DEFAULT 1,
    createdAt         TEXT NOT NULL,
    updatedAt         TEXT NOT NULL
  )`)

  await exec(`CREATE TABLE IF NOT EXISTS ReorderSuggestion (
    id            TEXT PRIMARY KEY,
    storeId       TEXT NOT NULL,
    productId     TEXT NOT NULL,
    currentStock  REAL NOT NULL DEFAULT 0,
    reorderPoint  REAL NOT NULL DEFAULT 0,
    suggestedQty  REAL NOT NULL DEFAULT 0,
    status        TEXT NOT NULL DEFAULT 'PENDING',
    createdAt     TEXT NOT NULL,
    updatedAt     TEXT NOT NULL
  )`)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  const activeFilter = req.nextUrl.searchParams.get('active')

  await ensureReorderTables()

  const conditions: string[] = ['rr.storeId = ?']
  const params: any[] = [storeId]

  if (activeFilter !== null) {
    conditions.push('rr.active = ?')
    params.push(activeFilter === 'true' ? 1 : 0)
  }

  const rows = await query(`
    SELECT
      rr.*,
      p.name AS productName,
      p.sku AS sku,
      p.stock AS currentStock,
      v.name AS vendorName
    FROM ReorderRule rr
    LEFT JOIN Product p ON rr.productId = p.id
    LEFT JOIN Vendor v ON rr.preferredVendorId = v.id
    WHERE ${conditions.join(' AND ')}
    ORDER BY p.name ASC
  `, params)

  const items = (rows as any[]).map(row => ({
    ...row,
    active: Boolean(row.active),
  }))

  return NextResponse.json(items)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureReorderTables()

  const b = (await req.json()) as any
  if (!b.productId) return err("Field 'productId' is required", 400, 'MISSING_FIELD')
  if (b.reorderPoint === undefined) return err("Field 'reorderPoint' is required", 400, 'MISSING_FIELD')
  if (b.reorderQty === undefined) return err("Field 'reorderQty' is required", 400, 'MISSING_FIELD')

  // Check for duplicate rule
  const existing = await query(
    `SELECT id FROM ReorderRule WHERE storeId = ? AND productId = ?`,
    [storeId, b.productId]
  )
  if (existing.length > 0) {
    return err('Reorder rule already exists for this product', 400, 'DUPLICATE')
  }

  const t = nowISO()
  const id = newId()

  await exec(
    `INSERT INTO ReorderRule (id, storeId, productId, reorderPoint, reorderQty, leadTimeDays, preferredVendorId, active, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      storeId,
      b.productId,
      b.reorderPoint,
      b.reorderQty,
      b.leadTimeDays ?? 0,
      b.preferredVendorId ?? null,
      1,
      t,
      t,
    ]
  )

  return NextResponse.json({ id }, { status: 201 })
}
