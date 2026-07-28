import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

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

async function nextEntryNumber(storeId: string): Promise<string> {
  const rows = await query(
    `SELECT entryNumber FROM JournalEntry WHERE storeId = ? ORDER BY createdAt DESC LIMIT 1`,
    [storeId]
  )
  const last = (rows[0] as any)?.entryNumber as string | undefined
  if (!last) {
    const year = new Date().getFullYear()
    return `JE-${year}-0001`
  }
  const parts = last.split('-')
  const seq = parseInt(parts[parts.length - 1] ?? '0', 10) + 1
  const year = new Date().getFullYear()
  return `JE-${year}-${String(seq).padStart(4, '0')}`
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureTables()

  const from = req.nextUrl.searchParams.get('from')
  const to = req.nextUrl.searchParams.get('to')
  const status = req.nextUrl.searchParams.get('status')

  let sql = `SELECT * FROM JournalEntry WHERE storeId = ?`
  const params: any[] = [storeId]

  if (from) { sql += ` AND date >= ?`; params.push(from) }
  if (to) { sql += ` AND date <= ?`; params.push(to) }
  if (status) { sql += ` AND status = ?`; params.push(status) }
  sql += ` ORDER BY date DESC, createdAt DESC`

  const rows = await query(sql, params)
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureTables()

  const b = (await req.json()) as any
  if (!b.date) return err("Field 'date' is required", 400, 'MISSING_FIELD')
  if (!b.description) return err("Field 'description' is required", 400, 'MISSING_FIELD')

  // Validate lines if provided
  const lines: any[] = b.lines ?? []
  if (lines.length > 0) {
    const totalDebit = lines.reduce((s: number, l: any) => s + (parseFloat(l.debit) || 0), 0)
    const totalCredit = lines.reduce((s: number, l: any) => s + (parseFloat(l.credit) || 0), 0)
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      return err('Journal entry is not balanced: total debits must equal total credits', 400, 'UNBALANCED')
    }
  }

  const id = newId()
  const now = nowISO()
  const createdBy = (user.name ?? user.email ?? 'Unknown') as string
  const entryNumber = await nextEntryNumber(storeId)

  await exec(
    `INSERT INTO JournalEntry
       (id, storeId, entryNumber, date, description, status, postedAt, reversedEntryId, createdAt, createdBy)
     VALUES (?, ?, ?, ?, ?, 'DRAFT', NULL, NULL, ?, ?)`,
    [id, storeId, entryNumber, b.date, b.description, now, createdBy]
  )

  // Insert lines if provided
  for (const line of lines) {
    const lineId = newId()
    await exec(
      `INSERT INTO JournalLine (id, entryId, storeId, accountCode, accountName, debit, credit, memo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        lineId, id, storeId,
        line.accountCode ?? '',
        line.accountName ?? '',
        parseFloat(line.debit) || 0,
        parseFloat(line.credit) || 0,
        line.memo ?? null,
      ]
    )
  }

  return NextResponse.json({ id, entryNumber }, { status: 201 })
}
