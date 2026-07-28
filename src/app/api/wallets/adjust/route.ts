// POST /api/wallets/adjust { customerId, storeId, amount, note }
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
  const { customerId, amount, note } = body

  if (!storeId) return err('storeId required')
  if (!customerId) return err('customerId required')
  if (amount === undefined || amount === null || amount === 0) return err('amount must be non-zero')
  if (!note?.trim()) return err('note is required for adjustments')

  await ensureTables()

  const wallet = await queryOne(
    `SELECT id, balance FROM CustomerWallet WHERE customerId = ? AND storeId = ?`,
    [customerId, storeId],
  )
  if (!wallet) return err('Wallet not found', 404)

  const newBalance = (wallet as any).balance + amount
  if (newBalance < 0) return err('Adjustment would result in negative balance')

  const now = nowISO()
  await exec(
    `UPDATE CustomerWallet SET balance = ?, updatedAt = ? WHERE id = ?`,
    [newBalance, now, (wallet as any).id],
  )

  const txId = newId()
  await exec(
    `INSERT INTO WalletTransaction (id, walletId, storeId, type, amount, note, orderId, createdAt) VALUES (?, ?, ?, 'ADJUSTMENT', ?, ?, NULL, ?)`,
    [txId, (wallet as any).id, storeId, amount, note.trim(), now],
  )

  return NextResponse.json({ ok: true, newBalance, transactionId: txId })
}
