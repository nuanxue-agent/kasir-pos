// POST /api/wallets/pay { customerId, storeId, orderId, amount }
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { queryOne, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

async function ensureTables() {
  await exec(`
    CREATE TABLE IF NOT EXISTS CustomerWallet (
      id         TEXT PRIMARY KEY,
      customerId TEXT NOT NULL,
      storeId    TEXT NOT NULL,
      balance    REAL NOT NULL DEFAULT 0,
      currency   TEXT NOT NULL DEFAULT 'IDR',
      updatedAt  TEXT NOT NULL,
      UNIQUE(customerId, storeId)
    )
  `)
  await exec(`
    CREATE TABLE IF NOT EXISTS WalletTransaction (
      id         TEXT PRIMARY KEY,
      walletId   TEXT NOT NULL,
      storeId    TEXT NOT NULL,
      type       TEXT NOT NULL CHECK(type IN ('TOPUP','PAYMENT','REFUND','ADJUSTMENT')),
      amount     REAL NOT NULL,
      note       TEXT,
      orderId    TEXT,
      createdAt  TEXT NOT NULL
    )
  `)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)
  const user = session.user as any

  const body = await req.json() as any
  const storeId = body.storeId ?? user.stores?.[0]?.id
  const { customerId, orderId, amount } = body

  if (!storeId) return err('storeId required')
  if (!customerId) return err('customerId required')
  if (!orderId) return err('orderId required')
  if (!amount || amount <= 0) return err('amount must be positive')

  await ensureTables()

  const wallet = await queryOne(
    `SELECT id, balance FROM CustomerWallet WHERE customerId = ? AND storeId = ?`,
    [customerId, storeId],
  )
  if (!wallet) return err('Wallet not found', 404)
  if ((wallet as any).balance < amount) return err('Insufficient wallet balance')

  const now = nowISO()
  await exec(
    `UPDATE CustomerWallet SET balance = balance - ?, updatedAt = ? WHERE id = ?`,
    [amount, now, (wallet as any).id],
  )

  const txId = newId()
  await exec(
    `INSERT INTO WalletTransaction (id, walletId, storeId, type, amount, note, orderId, createdAt) VALUES (?, ?, ?, 'PAYMENT', ?, ?, ?, ?)`,
    [txId, (wallet as any).id, storeId, amount, `Payment for order ${orderId}`, orderId, now],
  )

  const updated = await queryOne(`SELECT balance FROM CustomerWallet WHERE id = ?`, [(wallet as any).id])
  return NextResponse.json({ ok: true, remainingBalance: (updated as any)?.balance ?? 0, transactionId: txId })
}
