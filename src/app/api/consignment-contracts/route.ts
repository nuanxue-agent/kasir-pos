import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function ensureConsignmentTables() {
  await exec(`CREATE TABLE IF NOT EXISTS ConsignmentContract (
    id               TEXT PRIMARY KEY,
    storeId          TEXT NOT NULL,
    vendorId         TEXT NOT NULL,
    commissionRate   REAL NOT NULL DEFAULT 0,
    settlementPeriod TEXT NOT NULL DEFAULT 'MONTHLY',
    status           TEXT NOT NULL DEFAULT 'ACTIVE',
    startDate        TEXT NOT NULL,
    createdAt        TEXT NOT NULL,
    updatedAt        TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS ConsignmentItem (
    id          TEXT PRIMARY KEY,
    contractId  TEXT NOT NULL,
    storeId     TEXT NOT NULL,
    productId   TEXT NOT NULL,
    qty         REAL NOT NULL DEFAULT 0,
    costPrice   REAL NOT NULL DEFAULT 0,
    soldQty     REAL NOT NULL DEFAULT 0,
    settledQty  REAL NOT NULL DEFAULT 0,
    createdAt   TEXT NOT NULL,
    updatedAt   TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS ConsignmentSettlement (
    id               TEXT PRIMARY KEY,
    contractId       TEXT NOT NULL,
    storeId          TEXT NOT NULL,
    period           TEXT NOT NULL,
    soldQty          REAL NOT NULL DEFAULT 0,
    totalCost        REAL NOT NULL DEFAULT 0,
    commissionAmount REAL NOT NULL DEFAULT 0,
    status           TEXT NOT NULL DEFAULT 'PENDING',
    createdAt        TEXT NOT NULL,
    updatedAt        TEXT NOT NULL
  )`)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  const status = req.nextUrl.searchParams.get('status')
  const vendorId = req.nextUrl.searchParams.get('vendorId')

  await ensureConsignmentTables()

  let sql = `
    SELECT cc.*, v.name as vendorName
    FROM ConsignmentContract cc
    LEFT JOIN Vendor v ON cc.vendorId = v.id
    WHERE cc.storeId = ?
  `
  const params: any[] = [storeId]

  if (status) { sql += ` AND cc.status = ?`; params.push(status) }
  if (vendorId) { sql += ` AND cc.vendorId = ?`; params.push(vendorId) }
  sql += ` ORDER BY cc.createdAt DESC`

  const rows = await query(sql, params).catch(() => [])
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureConsignmentTables()

  const b = (await req.json()) as any
  if (!b.vendorId) return err("Field 'vendorId' is required", 400, 'MISSING_FIELD')
  if (!b.startDate) return err("Field 'startDate' is required", 400, 'MISSING_FIELD')
  if (b.commissionRate === undefined || b.commissionRate === null) {
    return err("Field 'commissionRate' is required", 400, 'MISSING_FIELD')
  }

  const rate = Number(b.commissionRate)
  if (isNaN(rate) || rate < 0 || rate > 100) {
    return err('commissionRate must be 0–100', 400, 'INVALID_FIELD')
  }

  const validPeriods = ['WEEKLY', 'MONTHLY']
  const settlementPeriod = b.settlementPeriod ?? 'MONTHLY'
  if (!validPeriods.includes(settlementPeriod)) {
    return err('settlementPeriod must be WEEKLY or MONTHLY', 400, 'INVALID_FIELD')
  }

  const t = nowISO()
  const id = newId()
  await exec(
    `INSERT INTO ConsignmentContract
       (id, storeId, vendorId, commissionRate, settlementPeriod, status, startDate, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)`,
    [id, storeId, b.vendorId, rate, settlementPeriod, b.startDate, t, t],
  )
  return NextResponse.json({ id }, { status: 201 })
}
