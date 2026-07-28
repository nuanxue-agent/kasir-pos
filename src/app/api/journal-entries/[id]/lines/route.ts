import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId } from '@/lib/db'

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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const { id } = await params
  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureTables()

  const entryRows = await query(
    `SELECT id FROM JournalEntry WHERE id = ? AND storeId = ?`,
    [id, storeId]
  )
  if (!entryRows[0]) return err('Journal entry not found', 404, 'NOT_FOUND')

  const lines = await query(
    `SELECT * FROM JournalLine WHERE entryId = ? ORDER BY rowid ASC`,
    [id]
  )
  return NextResponse.json(lines)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const { id } = await params
  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureTables()

  const entryRows = await query(
    `SELECT * FROM JournalEntry WHERE id = ? AND storeId = ?`,
    [id, storeId]
  )
  const entry = entryRows[0] as any
  if (!entry) return err('Journal entry not found', 404, 'NOT_FOUND')
  if (entry.status !== 'DRAFT') {
    return err('Lines can only be added to DRAFT entries', 400, 'INVALID_STATUS')
  }

  const b = (await req.json()) as any
  if (b.debit === undefined && b.credit === undefined) {
    return err("At least one of 'debit' or 'credit' is required", 400, 'MISSING_FIELD')
  }

  const debit = parseFloat(b.debit) || 0
  const credit = parseFloat(b.credit) || 0
  if (debit < 0 || credit < 0) return err('debit and credit must be non-negative', 400, 'INVALID_FIELD')
  if (debit > 0 && credit > 0) return err('A line cannot have both debit and credit', 400, 'INVALID_FIELD')

  const lineId = newId()
  await exec(
    `INSERT INTO JournalLine (id, entryId, storeId, accountCode, accountName, debit, credit, memo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      lineId, id, storeId,
      b.accountCode ?? '',
      b.accountName ?? '',
      debit, credit,
      b.memo ?? null,
    ]
  )

  return NextResponse.json({ id: lineId }, { status: 201 })
}
