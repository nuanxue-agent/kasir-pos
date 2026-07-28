// GET /api/credit-accounts?storeId=
// POST /api/credit-accounts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

async function ensureTables() {
  await exec(`
    CREATE TABLE IF NOT EXISTS CreditAccount (
      id          TEXT PRIMARY KEY,
      storeId     TEXT NOT NULL,
      customerId  TEXT NOT NULL,
      creditLimit REAL NOT NULL DEFAULT 0,
      balance     REAL NOT NULL DEFAULT 0,
      status      TEXT NOT NULL DEFAULT 'ACTIVE'
                  CHECK(status IN ('ACTIVE','SUSPENDED','CLOSED')),
      createdAt   TEXT NOT NULL,
      updatedAt   TEXT NOT NULL,
      UNIQUE(storeId, customerId)
    )
  `)
  await exec(`
    CREATE TABLE IF NOT EXISTS CreditTransaction (
      id        TEXT PRIMARY KEY,
      accountId TEXT NOT NULL,
      storeId   TEXT NOT NULL,
      type      TEXT NOT NULL CHECK(type IN ('PURCHASE','PAYMENT','ADJUSTMENT')),
      amount    REAL NOT NULL,
      orderId   TEXT,
      note      TEXT,
      createdAt TEXT NOT NULL
    )
  `)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)
  const user = session.user as any

  const sp = req.nextUrl.searchParams
  const storeId = sp.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required')

  await ensureTables()

  const rows = await query(
    `SELECT ca.*,
            c.name  AS customerName,
            c.email AS customerEmail,
            c.phone AS customerPhone
     FROM CreditAccount ca
     LEFT JOIN Customer c ON c.id = ca.customerId
     WHERE ca.storeId = ?
     ORDER BY ca.updatedAt DESC`,
    [storeId],
  )
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)

  const body = await req.json() as any
  const { storeId, customerId, creditLimit } = body
  if (!storeId || !customerId) return err('storeId and customerId required')
  if (!creditLimit || creditLimit <= 0) return err('creditLimit must be positive')

  await ensureTables()

  const now = nowISO()
  const id = newId()
  try {
    await exec(
      `INSERT INTO CreditAccount (id, storeId, customerId, creditLimit, balance, status, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, 0, 'ACTIVE', ?, ?)`,
      [id, storeId, customerId, creditLimit, now, now],
    )
  } catch (e: any) {
    if (e?.message?.includes('UNIQUE')) return err('Credit account already exists for this customer')
    throw e
  }

  const account = await query(
    `SELECT ca.*, c.name AS customerName, c.email AS customerEmail, c.phone AS customerPhone
     FROM CreditAccount ca LEFT JOIN Customer c ON c.id = ca.customerId
     WHERE ca.id = ?`,
    [id],
  )
  return NextResponse.json((account as any[])[0], { status: 201 })
}
