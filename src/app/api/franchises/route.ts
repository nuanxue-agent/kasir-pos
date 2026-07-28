import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function ensureFranchiseTables() {
  await exec(`CREATE TABLE IF NOT EXISTS Franchise (
    id                TEXT PRIMARY KEY,
    franchiseeStoreId TEXT NOT NULL,
    franchisorStoreId TEXT NOT NULL,
    royaltyRate       REAL NOT NULL DEFAULT 0,
    royaltyType       TEXT NOT NULL DEFAULT 'PERCENTAGE',
    billingCycle      TEXT NOT NULL DEFAULT 'MONTHLY',
    status            TEXT NOT NULL DEFAULT 'ACTIVE',
    startDate         TEXT NOT NULL,
    createdAt         TEXT NOT NULL,
    updatedAt         TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS FranchiseRoyalty (
    id          TEXT PRIMARY KEY,
    franchiseId TEXT NOT NULL,
    storeId     TEXT NOT NULL,
    period      TEXT NOT NULL,
    amount      REAL NOT NULL DEFAULT 0,
    status      TEXT NOT NULL DEFAULT 'PENDING',
    dueDate     TEXT NOT NULL,
    paidAt      TEXT,
    createdAt   TEXT NOT NULL,
    updatedAt   TEXT NOT NULL
  )`)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const sp = req.nextUrl.searchParams
  const storeId = sp.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureFranchiseTables()

  // Return franchises where this store is either franchisor or franchisee
  const rows = await query(
    `SELECT * FROM Franchise
     WHERE franchisorStoreId = ? OR franchiseeStoreId = ?
     ORDER BY createdAt DESC`,
    [storeId, storeId],
  )
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const sp = req.nextUrl.searchParams
  const storeId = sp.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureFranchiseTables()

  const b = (await req.json()) as any
  if (!b.franchiseeStoreId) return err("Field 'franchiseeStoreId' is required", 400, 'MISSING_FIELD')
  if (!b.startDate) return err("Field 'startDate' is required", 400, 'MISSING_FIELD')
  if (b.royaltyType && !['PERCENTAGE', 'FIXED'].includes(b.royaltyType))
    return err('royaltyType must be PERCENTAGE or FIXED', 400, 'INVALID_FIELD')
  if (b.billingCycle && !['WEEKLY', 'MONTHLY'].includes(b.billingCycle))
    return err('billingCycle must be WEEKLY or MONTHLY', 400, 'INVALID_FIELD')

  const t = nowISO()
  const id = newId()
  await exec(
    `INSERT INTO Franchise (id, franchiseeStoreId, franchisorStoreId, royaltyRate, royaltyType, billingCycle, status, startDate, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      b.franchiseeStoreId,
      storeId,
      b.royaltyRate ?? 0,
      b.royaltyType ?? 'PERCENTAGE',
      b.billingCycle ?? 'MONTHLY',
      'ACTIVE',
      b.startDate,
      t,
      t,
    ],
  )
  return NextResponse.json({ id }, { status: 201 })
}
