// GET/POST /api/bank-accounts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

export async function ensureBankAccountTables() {
  await exec(`CREATE TABLE IF NOT EXISTS BankAccount (
    id          TEXT PRIMARY KEY,
    storeId     TEXT NOT NULL,
    name        TEXT NOT NULL,
    bankName    TEXT NOT NULL DEFAULT '',
    accountNo   TEXT NOT NULL DEFAULT '',
    currency    TEXT NOT NULL DEFAULT 'IDR',
    balance     REAL NOT NULL DEFAULT 0,
    active      INTEGER NOT NULL DEFAULT 1,
    createdAt   TEXT NOT NULL,
    updatedAt   TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS BankStatement (
    id                   TEXT PRIMARY KEY,
    accountId            TEXT NOT NULL,
    storeId              TEXT NOT NULL,
    date                 TEXT NOT NULL,
    description          TEXT NOT NULL DEFAULT '',
    amount               REAL NOT NULL DEFAULT 0,
    type                 TEXT NOT NULL DEFAULT 'CREDIT',
    reference            TEXT,
    reconciled           INTEGER NOT NULL DEFAULT 0,
    matchedTransactionId TEXT,
    createdAt            TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS ReconciliationSession (
    id             TEXT PRIMARY KEY,
    accountId      TEXT NOT NULL,
    storeId        TEXT NOT NULL,
    period         TEXT NOT NULL,
    openingBalance REAL NOT NULL DEFAULT 0,
    closingBalance REAL NOT NULL DEFAULT 0,
    status         TEXT NOT NULL DEFAULT 'OPEN',
    completedAt    TEXT,
    createdAt      TEXT NOT NULL,
    updatedAt      TEXT NOT NULL
  )`)
}

// GET /api/bank-accounts?storeId=xxx
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
    if (!storeId) return err('storeId required')

    const hasAccess = (user.stores as any[])?.some((s: { id: string }) => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    await ensureBankAccountTables()

    const rows = await query(
      `SELECT * FROM BankAccount WHERE storeId = ? AND active = 1 ORDER BY createdAt ASC`,
      [storeId],
    )

    const accounts = (rows as any[]).map(r => ({
      ...r,
      active: Boolean(r.active),
      balance: Number(r.balance),
    }))

    return ok(accounts)
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500)
  }
}

// POST /api/bank-accounts?storeId=xxx
// Body: { name, bankName, accountNo, currency?, balance? }
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
    if (!storeId) return err('storeId required')

    const hasAccess = (user.stores as any[])?.some((s: { id: string }) => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    await ensureBankAccountTables()

    const b = (await req.json()) as any
    if (!b.name) return err("Field 'name' is required")
    if (!b.bankName) return err("Field 'bankName' is required")
    if (!b.accountNo && !b.accountNumber) return err("Field 'accountNo' is required")

    const t = nowISO()
    const id = newId()
    const accountNo = b.accountNo ?? b.accountNumber ?? ''
    const currency = (b.currency ?? 'IDR').toUpperCase()
    const balance = Number(b.balance ?? 0)

    await exec(
      `INSERT INTO BankAccount (id, storeId, name, bankName, accountNo, currency, balance, active, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [id, storeId, b.name, b.bankName, accountNo, currency, balance, t, t],
    )

    return ok({ id }, 201)
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500)
  }
}
