// GET  /api/wallets/:id/transactions
// POST /api/wallets/:id/transactions  { type, amount, reference?, description?, orderId? }
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

type TxType = 'TOPUP' | 'PAYMENT' | 'REFUND' | 'ADJUSTMENT' | 'EXPIRY'
const VALID_TYPES: TxType[] = ['TOPUP', 'PAYMENT', 'REFUND', 'ADJUSTMENT', 'EXPIRY']

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)

  const { id } = await params
  if (!id) return err('Wallet id required')

  await ensureTables()

  const wallet = await queryOne(`SELECT id, storeId FROM CustomerWallet WHERE id = ?`, [id])
  if (!wallet) return err('Wallet not found', 404)

  const txns = await query(
    `SELECT * FROM WalletTransaction WHERE walletId = ? ORDER BY createdAt ASC`,
    [id],
  )

  // Compute running balance for display
  let running = 0
  const withRunning = txns.map((tx: any) => {
    if (tx.type === 'PAYMENT' || tx.type === 'EXPIRY') {
      running -= tx.amount
    } else {
      running += tx.amount
    }
    return { ...tx, runningBalance: running }
  })

  return NextResponse.json(withRunning)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)

  const { id } = await params
  if (!id) return err('Wallet id required')

  await ensureTables()

  const wallet = await queryOne(
    `SELECT id, storeId, balance, active FROM CustomerWallet WHERE id = ?`,
    [id],
  )
  if (!wallet) return err('Wallet not found', 404)
  if (!(wallet as any).active) return err('Wallet is inactive')

  const body = await req.json() as any
  const { type, amount, reference, description, orderId } = body

  if (!type || !VALID_TYPES.includes(type)) {
    return err(`type must be one of: ${VALID_TYPES.join(', ')}`)
  }
  if (!amount || amount <= 0) return err('amount must be positive')

  const currentBalance: number = (wallet as any).balance
  const storeId: string = (wallet as any).storeId

  // Debit types
  const isDebit = type === 'PAYMENT' || type === 'EXPIRY'
  if (isDebit && currentBalance < amount) {
    return err('Insufficient wallet balance')
  }

  const newBalance = isDebit ? currentBalance - amount : currentBalance + amount

  const now = nowISO()

  // Update wallet balance + running totals
  if (type === 'PAYMENT') {
    await exec(
      `UPDATE CustomerWallet SET balance = ?, totalSpent = totalSpent + ?, updatedAt = ? WHERE id = ?`,
      [newBalance, amount, now, id],
    )
  } else if (type === 'TOPUP') {
    await exec(
      `UPDATE CustomerWallet SET balance = ?, totalTopUp = totalTopUp + ?, updatedAt = ? WHERE id = ?`,
      [newBalance, amount, now, id],
    )
  } else {
    await exec(
      `UPDATE CustomerWallet SET balance = ?, updatedAt = ? WHERE id = ?`,
      [newBalance, now, id],
    )
  }

  const txId = newId()
  await exec(
    `INSERT INTO WalletTransaction
       (id, walletId, storeId, type, amount, balance, reference, description, orderId, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [txId, id, storeId, type, amount, newBalance, reference ?? null, description ?? null, orderId ?? null, now],
  )

  const updated = await queryOne(`SELECT * FROM CustomerWallet WHERE id = ?`, [id])
  return NextResponse.json({ ok: true, wallet: updated, transactionId: txId }, { status: 201 })
}
