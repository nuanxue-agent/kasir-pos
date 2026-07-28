// GET /api/wallets?storeId=&customerId=
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec } from '@/lib/db'

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
