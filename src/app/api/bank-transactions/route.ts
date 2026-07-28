// GET/POST /api/bank-transactions
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

const VALID_TYPES = ['CREDIT', 'DEBIT']

// GET /api/bank-transactions?storeId=xxx&bankAccountId=yyy&status=UNMATCHED
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

    const bankAccountId = url.searchParams.get('bankAccountId')
    const status = url.searchParams.get('status')
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')

    let sql = `SELECT * FROM BankTransaction WHERE storeId = ?`
    const params: unknown[] = [storeId]

    if (bankAccountId) { sql += ` AND bankAccountId = ?`; params.push(bankAccountId) }
    if (status) { sql += ` AND status = ?`; params.push(status) }
    if (from) { sql += ` AND date >= ?`; params.push(from) }
    if (to) { sql += ` AND date <= ?`; params.push(to) }
    sql += ` ORDER BY date DESC`

    const rows = await query<Record<string, unknown>>(sql, params)
    return ok(rows)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    return err(msg, 500)
  }
}

// POST /api/bank-transactions?storeId=xxx
// Body: { bankAccountId, rows: Array<{ date, description, amount, type, reference? }> }
// Used for bulk CSV import
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
      bankAccountId?: string
      rows?: Array<{
        date?: string
        description?: string
        amount?: number
        type?: string
        reference?: string
      }>
    }

    if (!body.bankAccountId?.trim()) return err('bankAccountId required')
    if (!Array.isArray(body.rows) || body.rows.length === 0) return err('rows array required')

    const now = nowISO()
    const inserted: string[] = []

    for (const row of body.rows) {
      if (!row.date) continue
      if (!row.description?.trim()) continue
      const amount = Number(row.amount ?? 0)
      if (isNaN(amount) || amount <= 0) continue
      const type = (row.type ?? '').toUpperCase()
      if (!VALID_TYPES.includes(type)) continue

      const id = newId()
      await exec(
        `INSERT INTO BankTransaction (id, bankAccountId, storeId, date, description, amount, type, reference, status, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'UNMATCHED', ?)`,
        [id, body.bankAccountId.trim(), storeId, row.date, row.description.trim(), amount, type, row.reference ?? null, now]
      )
      inserted.push(id)
    }

    return ok({ imported: inserted.length, ids: inserted }, 201)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    return err(msg, 500)
  }
}
