import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

async function ensureTables() {
  await exec(`CREATE TABLE IF NOT EXISTS JournalEntry (
    id               TEXT PRIMARY KEY,
    storeId          TEXT NOT NULL,
    entryNumber      TEXT NOT NULL,
    date             TEXT NOT NULL,
    description      TEXT NOT NULL DEFAULT '',
    status           TEXT NOT NULL DEFAULT 'DRAFT',
    postedAt         TEXT,
    reversedEntryId  TEXT,
    createdAt        TEXT NOT NULL,
    createdBy        TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS JournalLine (
    id          TEXT PRIMARY KEY,
    entryId     TEXT NOT NULL,
    storeId     TEXT NOT NULL,
    accountCode TEXT NOT NULL DEFAULT '',
    accountName TEXT NOT NULL DEFAULT '',
    debit       REAL NOT NULL DEFAULT 0,
    credit      REAL NOT NULL DEFAULT 0,
    memo        TEXT
  )`)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureTables()

  const to = req.nextUrl.searchParams.get('to')
  const from = req.nextUrl.searchParams.get('from')

  let sql = `
    SELECT
      jl.accountCode,
      jl.accountName,
      SUM(jl.debit)  AS totalDebit,
      SUM(jl.credit) AS totalCredit
    FROM JournalLine jl
    JOIN JournalEntry je ON je.id = jl.entryId
    WHERE jl.storeId = ?
      AND je.status = 'POSTED'
  `
  const params: any[] = [storeId]

  if (from) { sql += ` AND je.date >= ?`; params.push(from) }
  if (to) { sql += ` AND je.date <= ?`; params.push(to) }
  sql += ` GROUP BY jl.accountCode, jl.accountName ORDER BY jl.accountCode ASC`

  const rows = await query(sql, params)

  const accounts = (rows as any[]).map(row => ({
    accountCode: row.accountCode,
    accountName: row.accountName,
    totalDebit: row.totalDebit ?? 0,
    totalCredit: row.totalCredit ?? 0,
    balance: (row.totalDebit ?? 0) - (row.totalCredit ?? 0),
  }))

  const grandDebit = accounts.reduce((s, a) => s + a.totalDebit, 0)
  const grandCredit = accounts.reduce((s, a) => s + a.totalCredit, 0)
  const isBalanced = Math.abs(grandDebit - grandCredit) < 0.01

  return NextResponse.json({ accounts, grandDebit, grandCredit, isBalanced })
}
