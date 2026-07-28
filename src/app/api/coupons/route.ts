import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function ensureCouponTables() {
  await exec(`CREATE TABLE IF NOT EXISTS Coupon (
    id               TEXT PRIMARY KEY,
    storeId          TEXT NOT NULL,
    code             TEXT NOT NULL,
    name             TEXT NOT NULL,
    discountType     TEXT NOT NULL DEFAULT 'PERCENTAGE',
    discountValue    REAL NOT NULL DEFAULT 0,
    minOrderAmount   REAL NOT NULL DEFAULT 0,
    maxDiscount      REAL,
    usageLimit       INTEGER,
    usedCount        INTEGER NOT NULL DEFAULT 0,
    perCustomerLimit INTEGER,
    segments         TEXT NOT NULL DEFAULT '[]',
    productIds       TEXT NOT NULL DEFAULT '[]',
    categoryIds      TEXT NOT NULL DEFAULT '[]',
    startDate        TEXT,
    endDate          TEXT,
    active           INTEGER NOT NULL DEFAULT 1,
    createdAt        TEXT NOT NULL,
    updatedAt        TEXT NOT NULL
  )`)

  await exec(`CREATE TABLE IF NOT EXISTS CouponUsage (
    id             TEXT PRIMARY KEY,
    couponId       TEXT NOT NULL,
    customerId     TEXT NOT NULL,
    storeId        TEXT NOT NULL,
    orderId        TEXT,
    discountAmount REAL NOT NULL DEFAULT 0,
    usedAt         TEXT NOT NULL
  )`)
}

function mapCoupon(row: any) {
  return {
    ...row,
    active: Boolean(row.active),
    segments: JSON.parse(row.segments || '[]'),
    productIds: JSON.parse(row.productIds || '[]'),
    categoryIds: JSON.parse(row.categoryIds || '[]'),
  }
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureCouponTables()

  const rows = await query(
    `SELECT * FROM Coupon WHERE storeId = ? ORDER BY createdAt DESC`,
    [storeId],
  )

  return NextResponse.json((rows as any[]).map(mapCoupon))
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureCouponTables()

  const b = (await req.json()) as any
  if (!b.code?.trim()) return err("Field 'code' is required", 400, 'MISSING_FIELD')
  if (!b.name?.trim()) return err("Field 'name' is required", 400, 'MISSING_FIELD')

  const code = String(b.code).toUpperCase().trim()

  // Unique code per store
  const existing = await query(`SELECT id FROM Coupon WHERE storeId = ? AND code = ?`, [storeId, code])
  if ((existing as any[]).length > 0) return err('Kode kupon sudah digunakan', 409, 'DUPLICATE_CODE')

  const t = nowISO()
  const id = newId()

  await exec(
    `INSERT INTO Coupon (id, storeId, code, name, discountType, discountValue, minOrderAmount, maxDiscount,
      usageLimit, usedCount, perCustomerLimit, segments, productIds, categoryIds, startDate, endDate, active, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, storeId, code, b.name,
      b.discountType ?? 'PERCENTAGE',
      b.discountValue ?? 0,
      b.minOrderAmount ?? 0,
      b.maxDiscount ?? null,
      b.usageLimit ?? null,
      b.perCustomerLimit ?? null,
      JSON.stringify(b.segments ?? []),
      JSON.stringify(b.productIds ?? []),
      JSON.stringify(b.categoryIds ?? []),
      b.startDate ?? null,
      b.endDate ?? null,
      b.active !== false ? 1 : 0,
      t, t,
    ],
  )

  return NextResponse.json({ id }, { status: 201 })
}
