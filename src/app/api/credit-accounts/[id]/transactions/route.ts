// GET /api/credit-accounts/[id]/transactions
// POST /api/credit-accounts/[id]/transactions
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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)

  const { id } = await params
  await ensureTables()

  const rows = await query(
    `SELECT * FROM CreditTransaction WHERE accountId = ? ORDER BY createdAt DESC`,
    [id],
  )
  return NextResponse.json(rows)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)

  const { id } = await params
  const body = await req.json() as any
  const { type, amount, orderId, note } = body

  if (!['PURCHASE', 'PAYMENT', 'ADJUSTMENT'].includes(type)) return err('Invalid transaction type')
  if (!amount || amount <= 0) return err('amount must be positive')

  await ensureTables()

  const accounts = await query('SELECT * FROM CreditAccount WHERE id = ?', [id])
  const account = (accounts as any[])[0]
  if (!account) return err('Account not found', 404)
  if (account.status !== 'ACTIVE') return err('Account is not active')

  // Enforce credit limit for purchases
  if (type === 'PURCHASE') {
    const newBalance = account.balance + amount
    if (newBalance > account.creditLimit) {
      return err(`Purchase would exceed credit limit. Available: ${account.creditLimit - account.balance}`)
    }
  }

  // Enforce payment does not exceed balance
  if (type === 'PAYMENT') {
    if (amount > account.balance) return err('Payment exceeds outstanding balance')
  }

  const now = nowISO()
  const txId = newId()

  await exec(
    `INSERT INTO CreditTransaction (id, accountId, storeId, type, amount, orderId, note, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [txId, id, account.storeId, type, amount, orderId ?? null, note ?? null, now],
  )

  // Update account balance
  let balanceDelta = amount
  if (type === 'PAYMENT') balanceDelta = -amount
  // ADJUSTMENT can be positive (charge) or negative (credit) — client sends signed amount for adjustments
  if (type === 'ADJUSTMENT') balanceDelta = amount  // positive = more owed

  await exec(
    `UPDATE CreditAccount SET balance = balance + ?, updatedAt = ? WHERE id = ?`,
    [balanceDelta, now, id],
  )

  const tx = await query('SELECT * FROM CreditTransaction WHERE id = ?', [txId])
  return NextResponse.json((tx as any[])[0], { status: 201 })
}
