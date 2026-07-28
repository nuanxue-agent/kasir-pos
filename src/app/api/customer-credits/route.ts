// GET  /api/customer-credits?storeId=
// POST /api/customer-credits
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import { calcAvailableCredit, determineCreditStatus } from '@/lib/credit-limits'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

async function ensureTables() {
  await exec(`
    CREATE TABLE IF NOT EXISTS CustomerCredit (
      id               TEXT PRIMARY KEY,
      storeId          TEXT NOT NULL,
      customerId       TEXT NOT NULL,
      creditLimit      REAL NOT NULL DEFAULT 0,
      usedCredit       REAL NOT NULL DEFAULT 0,
      availableCredit  REAL NOT NULL DEFAULT 0,
      paymentTermsDays INTEGER NOT NULL DEFAULT 30,
      status           TEXT NOT NULL DEFAULT 'GOOD',
      lastReviewedAt   TEXT,
      createdAt        TEXT NOT NULL,
      updatedAt        TEXT NOT NULL
    )
  `)
  await exec(`
    CREATE TABLE IF NOT EXISTS CreditTransaction (
      id          TEXT PRIMARY KEY,
      customerId  TEXT NOT NULL,
      storeId     TEXT NOT NULL,
      type        TEXT NOT NULL,
      amount      REAL NOT NULL,
      balance     REAL NOT NULL,
      reference   TEXT,
      createdAt   TEXT NOT NULL
    )
  `)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureTables()

  const rows = await query(
    `SELECT
       cc.*,
       c.name  AS customerName,
       c.email AS customerEmail,
       c.phone AS customerPhone
     FROM CustomerCredit cc
     LEFT JOIN Customer c ON c.id = cc.customerId
     WHERE cc.storeId = ?
     ORDER BY cc.createdAt DESC
     LIMIT 500`,
    [storeId],
  )

  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  await ensureTables()

  const b = (await req.json()) as any
  const storeId = b.storeId ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  const { customerId, creditLimit, paymentTermsDays } = b
  if (!customerId) return err("Field 'customerId' is required", 400, 'MISSING_FIELD')

  const limit = Number(creditLimit)
  if (!limit || limit <= 0) return err('creditLimit must be a positive number', 400, 'INVALID_VALUE')

  const terms = Number(paymentTermsDays ?? 30)
  if (!terms || terms <= 0) return err('paymentTermsDays must be a positive integer', 400, 'INVALID_VALUE')

  // Check for duplicate
  const existing = await query(
    `SELECT id FROM CustomerCredit WHERE storeId=? AND customerId=? LIMIT 1`,
    [storeId, customerId],
  )
  if ((existing as any[]).length > 0) return err('Credit account already exists for this customer', 409, 'DUPLICATE')

  const id = newId()
  const now = nowISO()
  const available = calcAvailableCredit(limit, 0)
  const status = determineCreditStatus(limit, 0)

  await exec(
    `INSERT INTO CustomerCredit
       (id, storeId, customerId, creditLimit, usedCredit, availableCredit, paymentTermsDays, status, lastReviewedAt, createdAt, updatedAt)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [id, storeId, customerId, limit, 0, available, terms, status, null, now, now],
  )

  return NextResponse.json({ id, storeId, customerId, creditLimit: limit, usedCredit: 0, availableCredit: available, paymentTermsDays: terms, status, lastReviewedAt: null, createdAt: now, updatedAt: now }, { status: 201 })
}
