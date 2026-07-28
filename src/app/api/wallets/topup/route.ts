// POST /api/wallets/topup { customerId, storeId, amount, note, method, giftCardCode? }
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, queryOne, exec, newId, nowISO } from '@/lib/db'

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
  const { customerId, amount, note, method, giftCardCode } = body

  if (!storeId) return err('storeId required')
  if (!customerId) return err('customerId required')
  if (!amount || amount <= 0) return err('amount must be positive')

  await ensureTables()

  // Validate customer exists
  const customer = await queryOne(`SELECT id, name FROM Customer WHERE id = ? AND storeId = ?`, [customerId, storeId])
  if (!customer) return err('Customer not found', 404)

  // If gift card method, redeem the card
  if (method === 'GIFT_CARD') {
    if (!giftCardCode) return err('giftCardCode required for gift card top-up')
    const card = await queryOne(
      `SELECT id, balance, status FROM GiftCard WHERE code = ? AND storeId = ?`,
      [giftCardCode, storeId],
    )
    if (!card) return err('Gift card not found', 404)
    if ((card as any).status !== 'ACTIVE') return err('Gift card is not active')
    if ((card as any).balance < amount) return err('Gift card balance insufficient')
    // Deduct from gift card
    await exec(
      `UPDATE GiftCard SET balance = balance - ?, status = CASE WHEN balance - ? <= 0 THEN 'REDEEMED' ELSE status END WHERE id = ?`,
      [amount, amount, (card as any).id],
    )
  }

  const now = nowISO()

  // Upsert wallet
  const existing = await queryOne(
    `SELECT id, balance FROM CustomerWallet WHERE customerId = ? AND storeId = ?`,
    [customerId, storeId],
  )

  let walletId: string
  if (existing) {
    walletId = (existing as any).id
    await exec(
      `UPDATE CustomerWallet SET balance = balance + ?, updatedAt = ? WHERE id = ?`,
      [amount, now, walletId],
    )
  } else {
    walletId = newId()
    // Get store currency
    const store = await queryOne(`SELECT currency FROM Store WHERE id = ?`, [storeId])
    const currency = (store as any)?.currency ?? 'IDR'
    await exec(
      `INSERT INTO CustomerWallet (id, customerId, storeId, balance, currency, updatedAt) VALUES (?, ?, ?, ?, ?, ?)`,
      [walletId, customerId, storeId, amount, currency, now],
    )
  }

  // Record transaction
  const txId = newId()
  await exec(
    `INSERT INTO WalletTransaction (id, walletId, storeId, type, amount, note, orderId, createdAt) VALUES (?, ?, ?, 'TOPUP', ?, ?, NULL, ?)`,
    [txId, walletId, storeId, amount, note ?? `Top up via ${(method ?? 'CASH').toLowerCase()}`, now],
  )

  const wallet = await queryOne(`SELECT * FROM CustomerWallet WHERE id = ?`, [walletId])
  return NextResponse.json({ ok: true, wallet, transactionId: txId })
}
