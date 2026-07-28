import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import { generateGiftCardCode } from '@/lib/gift-cards'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function ensureGiftCardTables() {
  await exec(`CREATE TABLE IF NOT EXISTS GiftCard (
    id             TEXT PRIMARY KEY,
    storeId        TEXT NOT NULL,
    code           TEXT NOT NULL UNIQUE,
    balance        REAL NOT NULL DEFAULT 0,
    initialBalance REAL NOT NULL DEFAULT 0,
    status         TEXT NOT NULL DEFAULT 'ACTIVE',
    expiryDate     TEXT,
    issuedAt       TEXT NOT NULL,
    issuedTo       TEXT,
    createdAt      TEXT NOT NULL,
    updatedAt      TEXT NOT NULL
  )`)

  await exec(`CREATE TABLE IF NOT EXISTS GiftCardTransaction (
    id        TEXT PRIMARY KEY,
    cardId    TEXT NOT NULL,
    storeId   TEXT NOT NULL,
    type      TEXT NOT NULL DEFAULT 'ISSUE',
    amount    REAL NOT NULL DEFAULT 0,
    orderId   TEXT,
    note      TEXT,
    createdAt TEXT NOT NULL
  )`)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureGiftCardTables()

  const status = req.nextUrl.searchParams.get('status')
  const rows = status
    ? await query(`SELECT * FROM GiftCard WHERE storeId = ? AND status = ? ORDER BY issuedAt DESC`, [storeId, status])
    : await query(`SELECT * FROM GiftCard WHERE storeId = ? ORDER BY issuedAt DESC`, [storeId])

  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureGiftCardTables()

  const b = (await req.json()) as any
  const amount = Number(b.amount ?? 0)
  if (!amount || amount <= 0) return err('amount must be positive', 400, 'MISSING_FIELD')

  const code = b.code ?? generateGiftCardCode()
  const id = newId()
  const t = nowISO()

  await exec(
    `INSERT INTO GiftCard (id, storeId, code, balance, initialBalance, status, expiryDate, issuedAt, issuedTo, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?)`,
    [id, storeId, code, amount, amount, b.expiryDate ?? null, t, b.issuedTo ?? null, t, t],
  )

  // Record ISSUE transaction
  await exec(
    `INSERT INTO GiftCardTransaction (id, cardId, storeId, type, amount, orderId, note, createdAt)
     VALUES (?, ?, ?, 'ISSUE', ?, ?, ?, ?)`,
    [newId(), id, storeId, amount, b.orderId ?? null, b.note ?? null, t],
  )

  return NextResponse.json({ id, code }, { status: 201 })
}
