// POST /api/wallets/:id/topup  { amount, method, reference?, description?, storeId? }
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { queryOne, exec, newId, nowISO } from '@/lib/db'

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

const VALID_METHODS = ['CASH', 'TRANSFER', 'CARD'] as const
type TopupMethod = typeof VALID_METHODS[number]

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)

  const { id } = await params
  if (!id) return err('Wallet id required')

  const body = await req.json() as any
  const { amount, method, reference, description } = body

  if (!amount || amount <= 0) return err('amount must be positive')

  const topupMethod: TopupMethod = VALID_METHODS.includes(method) ? method : 'CASH'

  await ensureTables()

  const wallet = await queryOne(
    `SELECT id, storeId, balance, active FROM CustomerWallet WHERE id = ?`,
    [id],
  )
  if (!wallet) return err('Wallet not found', 404)
  if (!(wallet as any).active) return err('Wallet is inactive')

  const now = nowISO()
  const newBalance = (wallet as any).balance + amount

  await exec(
    `UPDATE CustomerWallet
     SET balance = ?, totalTopUp = totalTopUp + ?, updatedAt = ?
     WHERE id = ?`,
    [newBalance, amount, now, id],
  )

  const txId = newId()
  await exec(
    `INSERT INTO WalletTransaction
       (id, walletId, storeId, type, amount, balance, reference, description, createdAt)
     VALUES (?, ?, ?, 'TOPUP', ?, ?, ?, ?, ?)`,
    [
      txId,
      id,
      (wallet as any).storeId,
      amount,
      newBalance,
      reference ?? null,
      description ?? `Top up via ${topupMethod.toLowerCase()}`,
      now,
    ],
  )

  const updated = await queryOne(`SELECT * FROM CustomerWallet WHERE id = ?`, [id])
  return NextResponse.json({ ok: true, wallet: updated, transactionId: txId })
}
