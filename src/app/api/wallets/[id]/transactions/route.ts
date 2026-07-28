// GET /api/wallets/:id/transactions
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, queryOne, exec } from '@/lib/db'

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

  // Compute running balance for each transaction
  let running = 0
  const withRunning = txns.map((tx: any) => {
    if (tx.type === 'PAYMENT') {
      running -= tx.amount
    } else {
      // TOPUP, REFUND, ADJUSTMENT (can be negative for deduction adjustments)
      running += tx.amount
    }
    return { ...tx, runningBalance: running }
  })

  return NextResponse.json(withRunning)
}
