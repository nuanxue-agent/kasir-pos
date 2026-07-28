// GET/POST /api/bank-accounts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

async function ensureTables() {
  await exec(`CREATE TABLE IF NOT EXISTS BankAccount (
    id TEXT PRIMARY KEY,
    storeId TEXT NOT NULL,
    name TEXT NOT NULL,
    bankName TEXT NOT NULL,
    accountNumber TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'IDR',
    balance REAL NOT NULL DEFAULT 0,
    lastReconciledAt TEXT
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS BankTransaction (
    id TEXT PRIMARY KEY,
    bankAccountId TEXT NOT NULL,
    storeId TEXT NOT NULL,
    date TEXT NOT NULL,
    description TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    type TEXT NOT NULL DEFAULT 'CREDIT',
    reference TEXT,
    matchedOrderId TEXT,
    matchedJournalId TEXT,
    status TEXT NOT NULL DEFAULT 'UNMATCHED',
    createdAt TEXT NOT NULL
  )`)
}

// GET /api/bank-accounts?storeId=xxx
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const url = new URL(req.url)
    const storeId = url.searchParams.get('storeId')
    if (!storeId) return err('storeId required')

    const hasAccess = user.stores?.some((s: { id: string }) => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    await ensureTables()

    const accounts = await query<Record<string, unknown>>(
      `SELECT * FROM BankAccount WHERE storeId = ? ORDER BY name ASC`,
      [storeId]
    )
    return ok(accounts)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    return err(msg, 500)
  }
}

// POST /api/bank-accounts?storeId=xxx
// Body: { name, bankName, accountNumber, currency?, balance? }
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const url = new URL(req.url)
    const storeId = url.searchParams.get('storeId')
    if (!storeId) return err('storeId required')

    const hasAccess = user.stores?.some((s: { id: string }) => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    await ensureTables()

    const body = await req.json() as {
      name?: string
      bankName?: string
      accountNumber?: string
      currency?: string
      balance?: number
    }

    if (!body.name?.trim()) return err('name required')
    if (!body.bankName?.trim()) return err('bankName required')
    if (!body.accountNumber?.trim()) return err('accountNumber required')

    const id = newId()
    const currency = body.currency ?? 'IDR'
    const balance = Number(body.balance ?? 0)

    await exec(
      `INSERT INTO BankAccount (id, storeId, name, bankName, accountNumber, currency, balance)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, storeId, body.name.trim(), body.bankName.trim(), body.accountNumber.trim(), currency, balance]
    )

    return ok({ id, storeId, name: body.name.trim(), bankName: body.bankName.trim(), accountNumber: body.accountNumber.trim(), currency, balance, lastReconciledAt: null }, 201)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    return err(msg, 500)
  }
}
