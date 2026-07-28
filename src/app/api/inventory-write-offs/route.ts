import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

async function ensureTable() {
  await exec(`CREATE TABLE IF NOT EXISTS InventoryWriteOff (
    id          TEXT PRIMARY KEY,
    storeId     TEXT NOT NULL,
    productId   TEXT NOT NULL,
    productName TEXT NOT NULL,
    qty         REAL NOT NULL DEFAULT 0,
    reason      TEXT NOT NULL DEFAULT 'OTHER',
    costValue   REAL NOT NULL DEFAULT 0,
    approvedBy  TEXT,
    approvedAt  TEXT,
    status      TEXT NOT NULL DEFAULT 'PENDING',
    notes       TEXT,
    createdAt   TEXT NOT NULL,
    createdBy   TEXT NOT NULL
  )`)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureTable()

  const status = req.nextUrl.searchParams.get('status')
  const reason = req.nextUrl.searchParams.get('reason')

  let sql = `SELECT * FROM InventoryWriteOff WHERE storeId = ?`
  const params: any[] = [storeId]

  if (status) { sql += ` AND status = ?`; params.push(status) }
  if (reason) { sql += ` AND reason = ?`; params.push(reason) }
  sql += ` ORDER BY createdAt DESC`

  const rows = await query(sql, params)
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureTable()

  const b = (await req.json()) as any
  if (!b.productId) return err("Field 'productId' is required", 400, 'MISSING_FIELD')
  if (b.qty === undefined || b.qty === null) return err("Field 'qty' is required", 400, 'MISSING_FIELD')

  const validReasons = ['EXPIRED', 'DAMAGED', 'LOST', 'THEFT', 'OBSOLETE']
  const reason = b.reason || 'EXPIRED'
  if (!validReasons.includes(reason)) return err('Invalid reason', 400, 'INVALID_FIELD')

  const productRows = await query(
    `SELECT id, name, cost FROM Product WHERE id = ? AND storeId = ?`,
    [b.productId, storeId]
  )
  const product = productRows[0] as any
  if (!product) return err('Product not found', 404, 'NOT_FOUND')

  const qty = parseFloat(b.qty)
  if (qty <= 0) return err('qty must be positive', 400, 'INVALID_FIELD')

  const unitCost = parseFloat(product.cost ?? '0')
  const costValue = qty * unitCost

  const id = newId()
  const now = nowISO()
  const createdBy = (user.name ?? user.email ?? 'Unknown') as string

  await exec(
    `INSERT INTO InventoryWriteOff
       (id, storeId, productId, productName, qty, reason, costValue, approvedBy, approvedAt, status, notes, createdAt, createdBy)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, 'PENDING', ?, ?, ?)`,
    [id, storeId, b.productId, product.name, qty, reason, costValue, b.notes ?? null, now, createdBy]
  )

  return NextResponse.json({ id }, { status: 201 })
}
