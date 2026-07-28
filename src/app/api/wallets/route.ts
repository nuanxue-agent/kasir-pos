// GET  /api/wallets?storeId=&customerId=
// POST /api/wallets  { customerId, storeId, currency? }
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, queryOne, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

async function ensureTables() {
  await exec(`
    CREATE TABLE IF NOT EXISTS CustomerWallet (
      id          TEXT PRIMARY KEY,
      customerId  TEXT NOT NULL,
      storeId     TEXT NOT NULL,
      balance     REAL NOT NULL DEFAULT 0,
      totalTopUp  REAL NOT NULL DEFAULT 0,
      totalSpent  REAL NOT NULL DEFAULT 0,
      currency    TEXT NOT NULL DEFAULT 'IDR',
      active      INTEGER NOT NULL DEFAULT 1,
      updatedAt   TEXT NOT NULL,
      UNIQUE(customerId, storeId)
    )
  `)
  await exec(`
    CREATE TABLE IF NOT EXISTS WalletTransaction (
      id          TEXT PRIMARY KEY,
      walletId    TEXT NOT NULL,
      storeId     TEXT NOT NULL,
      type        TEXT NOT NULL CHECK(type IN ('TOPUP','PAYMENT','REFUND','ADJUSTMENT','EXPIRY')),
      amount      REAL NOT NULL,
      balance     REAL NOT NULL DEFAULT 0,
      reference   TEXT,
      description TEXT,
      note        TEXT,
      orderId     TEXT,
      createdAt   TEXT NOT NULL
    )
  `)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)
  const user = session.user as any

  const sp = req.nextUrl.searchParams
  const storeId = sp.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400)

  await ensureTables()

  const customerId = sp.get('customerId')
  const rows = await query(
    `SELECT cw.*,
            c.name  AS customerName,
            c.email AS customerEmail,
            c.phone AS customerPhone
     FROM CustomerWallet cw
     LEFT JOIN Customer c ON c.id = cw.customerId
     WHERE cw.storeId = ?
     ${customerId ? 'AND cw.customerId = ?' : ''}
     ORDER BY cw.updatedAt DESC`,
    customerId ? [storeId, customerId] : [storeId],
  )
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)
  const user = session.user as any

  const body = await req.json() as any
  const storeId = body.storeId ?? user.stores?.[0]?.id
  const { customerId, currency } = body

  if (!storeId) return err('storeId required')
  if (!customerId) return err('customerId required')

  await ensureTables()

  // Validate customer exists
  const customer = await queryOne(
    `SELECT id FROM Customer WHERE id = ? AND storeId = ?`,
    [customerId, storeId],
  )
  if (!customer) return err('Customer not found', 404)

  // Check if wallet already exists
  const existing = await queryOne(
    `SELECT id FROM CustomerWallet WHERE customerId = ? AND storeId = ?`,
    [customerId, storeId],
  )
  if (existing) return err('Wallet already exists for this customer', 409)

  // Resolve currency from store if not provided
  const store = await queryOne(`SELECT currency FROM Store WHERE id = ?`, [storeId])
  const resolvedCurrency = currency ?? (store as any)?.currency ?? 'IDR'

  const id = newId()
  const now = nowISO()
  await exec(
    `INSERT INTO CustomerWallet (id, customerId, storeId, balance, totalTopUp, totalSpent, currency, active, updatedAt)
     VALUES (?, ?, ?, 0, 0, 0, ?, 1, ?)`,
    [id, customerId, storeId, resolvedCurrency, now],
  )

  const wallet = await queryOne(`SELECT * FROM CustomerWallet WHERE id = ?`, [id])
  return NextResponse.json({ ok: true, wallet }, { status: 201 })
}
