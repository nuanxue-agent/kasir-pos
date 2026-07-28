// GET /api/credit-accounts/aging?storeId=
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec } from '@/lib/db'

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

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)
  const user = session.user as any

  const sp = req.nextUrl.searchParams
  const storeId = sp.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required')

  await ensureTables()

  // Get all accounts with outstanding balances
  const accounts = await query(
    `SELECT ca.id AS accountId, ca.customerId, ca.balance, c.name AS customerName
     FROM CreditAccount ca
     LEFT JOIN Customer c ON c.id = ca.customerId
     WHERE ca.storeId = ? AND ca.balance > 0
     ORDER BY ca.balance DESC`,
    [storeId],
  ) as any[]

  if (accounts.length === 0) return NextResponse.json([])

  // For each account, fetch all PURCHASE transactions and bucket by age
  const now = new Date()
  const aging = await Promise.all(
    accounts.map(async (account) => {
      const purchases = await query(
        `SELECT amount, createdAt FROM CreditTransaction
         WHERE accountId = ? AND type = 'PURCHASE'
         ORDER BY createdAt ASC`,
        [account.accountId],
      ) as any[]

      let current = 0, days30 = 0, days60 = 0, days90 = 0, over90 = 0

      for (const p of purchases) {
        const createdDate = new Date(p.createdAt)
        const ageMs = now.getTime() - createdDate.getTime()
        const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24))

        if (ageDays <= 30) current += p.amount
        else if (ageDays <= 60) days30 += p.amount
        else if (ageDays <= 90) days60 += p.amount
        else if (ageDays <= 120) days90 += p.amount
        else over90 += p.amount
      }

      return {
        customerId: account.customerId,
        customerName: account.customerName,
        accountId: account.accountId,
        current,
        days30,
        days60,
        days90,
        over90,
        total: account.balance,
      }
    }),
  )

  // Filter to only accounts with overdue amounts
  const overdue = aging.filter(a => a.days30 + a.days60 + a.days90 + a.over90 > 0)
  return NextResponse.json(overdue)
}
