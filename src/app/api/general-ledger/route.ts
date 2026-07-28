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

  const accountCode = req.nextUrl.searchParams.get('accountCode')
  const from = req.nextUrl.searchParams.get('from')
  const to = req.nextUrl.searchParams.get('to')

  // Join lines with posted entries only
  let sql = `
    SELECT
      jl.id,
      jl.entryId,
      je.entryNumber,
      je.date,
      je.description      AS entryDescription,
      jl.accountCode,
      jl.accountName,
      jl.debit,
      jl.credit,
      jl.memo
    FROM JournalLine jl
    JOIN JournalEntry je ON je.id = jl.entryId
    WHERE jl.storeId = ?
      AND je.status = 'POSTED'
  `
  const params: any[] = [storeId]

  if (accountCode) { sql += ` AND jl.accountCode = ?`; params.push(accountCode) }
  if (from) { sql += ` AND je.date >= ?`; params.push(from) }
  if (to) { sql += ` AND je.date <= ?`; params.push(to) }
  sql += ` ORDER BY je.date ASC, je.createdAt ASC`

  const rows = await query(sql, params)

  // Compute running balance per account (or for the filtered account)
  let runningBalance = 0
  const withBalance = (rows as any[]).map(row => {
    runningBalance += (row.debit ?? 0) - (row.credit ?? 0)
    return { ...row, runningBalance }
  })

  // If no accountCode filter, group by account
  if (!accountCode) {
    const byAccount: Record<string, any[]> = {}
    for (const row of withBalance) {
      const key = row.accountCode as string
      if (!byAccount[key]) byAccount[key] = []
      // Reset running balance per account
      byAccount[key].push(row)
    }
    // Recompute running balance per account
    const result: any[] = []
    for (const [code, lines] of Object.entries(byAccount)) {
      let bal = 0
      for (const line of lines) {
        bal += (line.debit ?? 0) - (line.credit ?? 0)
        result.push({ ...line, runningBalance: bal })
      }
    }
    return NextResponse.json(result)
  }

  return NextResponse.json(withBalance)
}
