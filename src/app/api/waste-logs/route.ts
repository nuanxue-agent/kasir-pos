import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

async function ensureTables() {
  await exec(`CREATE TABLE IF NOT EXISTS WasteLog (
    id          TEXT PRIMARY KEY,
    storeId     TEXT NOT NULL,
    productId   TEXT NOT NULL,
    productName TEXT NOT NULL,
    qty         REAL NOT NULL DEFAULT 0,
    reason      TEXT NOT NULL DEFAULT 'OTHER',
    cost        REAL NOT NULL DEFAULT 0,
    recordedBy  TEXT NOT NULL,
    recordedAt  TEXT NOT NULL,
    notes       TEXT
  )`)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureTables()

  const rows = await query(
    `SELECT * FROM WasteLog WHERE storeId = ? ORDER BY recordedAt DESC`,
    [storeId]
  )
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureTables()

  const b = (await req.json()) as any
  if (!b.productId) return err("Field 'productId' is required", 400, 'MISSING_FIELD')
  if (b.qty === undefined || b.qty === null) return err("Field 'qty' is required", 400, 'MISSING_FIELD')

  const validReasons = ['EXPIRED', 'DAMAGED', 'SPOILED', 'RETURNED', 'OTHER']
  const reason = b.reason || 'OTHER'
  if (!validReasons.includes(reason)) return err('Invalid reason', 400, 'INVALID_FIELD')

  // Look up product to get name and cost
  const productRows = await query(
    `SELECT id, name, cost FROM Product WHERE id = ? AND storeId = ?`,
    [b.productId, storeId]
  )
  const product = productRows[0] as any
  if (!product) return err('Product not found', 404, 'NOT_FOUND')

  const qty = parseFloat(b.qty)
  const unitCost = parseFloat(product.cost ?? '0')
  const totalCost = qty * unitCost

  const id = newId()
  const now = nowISO()
  const recordedBy = user.name ?? user.email ?? 'Unknown'

  await exec(
    `INSERT INTO WasteLog (id, storeId, productId, productName, qty, reason, cost, recordedBy, recordedAt, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, storeId, b.productId, product.name, qty, reason, totalCost, recordedBy, now, b.notes ?? null]
  )

  return NextResponse.json({ id }, { status: 201 })
}
