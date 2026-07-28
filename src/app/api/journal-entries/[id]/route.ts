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

export async function PATCH(
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

  const rows = await query(`SELECT * FROM JournalEntry WHERE id = ? AND storeId = ?`, [id, storeId])
  const entry = rows[0] as any
  if (!entry) return err('Journal entry not found', 404, 'NOT_FOUND')

  const b = (await req.json()) as any
  const action = b.action as string

  if (action === 'post') {
    if (entry.status !== 'DRAFT') {
      return err('Only DRAFT entries can be posted', 400, 'INVALID_STATUS')
    }
    // Verify balance before posting
    const lines = await query(`SELECT * FROM JournalLine WHERE entryId = ?`, [id])
    const totalDebit = (lines as any[]).reduce((s, l) => s + (l.debit ?? 0), 0)
    const totalCredit = (lines as any[]).reduce((s, l) => s + (l.credit ?? 0), 0)
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      return err('Cannot post: entry is not balanced', 400, 'UNBALANCED')
    }
    const now = nowISO()
    await exec(
      `UPDATE JournalEntry SET status = 'POSTED', postedAt = ? WHERE id = ?`,
      [now, id]
    )
    return NextResponse.json({ id, status: 'POSTED', postedAt: now })
  }

  if (action === 'reverse') {
    if (entry.status !== 'POSTED') {
      return err('Only POSTED entries can be reversed', 400, 'INVALID_STATUS')
    }

    // Create reversal entry
    const lines = await query(`SELECT * FROM JournalLine WHERE entryId = ?`, [id])
    const now = nowISO()
    const createdBy = (user.name ?? user.email ?? 'Unknown') as string

    // Generate reversal entry number
    const lastRows = await query(
      `SELECT entryNumber FROM JournalEntry WHERE storeId = ? ORDER BY createdAt DESC LIMIT 1`,
      [storeId]
    )
    const last = (lastRows[0] as any)?.entryNumber as string | undefined
    let seq = 1
    if (last) {
      const parts = last.split('-')
      seq = parseInt(parts[parts.length - 1] ?? '0', 10) + 1
    }
    const year = new Date().getFullYear()
    const reversalNumber = `JE-${year}-${String(seq).padStart(4, '0')}`
    const reversalId = newId()

    await exec(
      `INSERT INTO JournalEntry
         (id, storeId, entryNumber, date, description, status, postedAt, reversedEntryId, createdAt, createdBy)
       VALUES (?, ?, ?, ?, ?, 'POSTED', ?, NULL, ?, ?)`,
      [
        reversalId, storeId, reversalNumber,
        new Date().toISOString().slice(0, 10),
        `REVERSAL: ${entry.description}`,
        now, now, createdBy,
      ]
    )

    // Swap debit/credit for reversal lines
    for (const line of lines as any[]) {
      const lineId = newId()
      await exec(
        `INSERT INTO JournalLine (id, entryId, storeId, accountCode, accountName, debit, credit, memo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          lineId, reversalId, storeId,
          line.accountCode, line.accountName,
          line.credit,   // swap
          line.debit,    // swap
          line.memo,
        ]
      )
    }

    // Mark original as REVERSED
    await exec(
      `UPDATE JournalEntry SET status = 'REVERSED', reversedEntryId = ? WHERE id = ?`,
      [reversalId, id]
    )

    return NextResponse.json({ id, status: 'REVERSED', reversalId, reversalNumber })
  }

  return err("action must be 'post' or 'reverse'", 400, 'INVALID_FIELD')
}
