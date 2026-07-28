// PATCH /api/wallets/:id  { active? }
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { queryOne, exec, nowISO } from '@/lib/db'

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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)

  const { id } = await params
  if (!id) return err('Wallet id required')

  await ensureTables()

  const wallet = await queryOne(
    `SELECT id, storeId, balance FROM CustomerWallet WHERE id = ?`,
    [id],
  )
  if (!wallet) return err('Wallet not found', 404)

  const body = await req.json() as any

  // Build dynamic SET clause — only allow patching `active`
  const updates: string[] = []
  const values: unknown[] = []

  if (typeof body.active === 'boolean' || body.active === 0 || body.active === 1) {
    updates.push('active = ?')
    values.push(body.active ? 1 : 0)
  }

  if (updates.length === 0) return err('No patchable fields provided')

  updates.push('updatedAt = ?')
  values.push(nowISO())
  values.push(id)

  await exec(
    `UPDATE CustomerWallet SET ${updates.join(', ')} WHERE id = ?`,
    values,
  )

  const updated = await queryOne(`SELECT * FROM CustomerWallet WHERE id = ?`, [id])
  return NextResponse.json({ ok: true, wallet: updated })
}
