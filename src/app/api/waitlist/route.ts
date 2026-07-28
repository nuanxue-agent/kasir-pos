// GET /api/waitlist?storeId=&status=
// POST /api/waitlist
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, queryOne, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

const AVG_MINUTES_PER_PARTY = 20

async function ensureTables() {
  await exec(`
    CREATE TABLE IF NOT EXISTS WaitlistEntry (
      id            TEXT PRIMARY KEY,
      storeId       TEXT NOT NULL,
      customerName  TEXT NOT NULL,
      customerPhone TEXT NOT NULL,
      partySize     INTEGER NOT NULL,
      addedAt       TEXT NOT NULL,
      estimatedWait INTEGER NOT NULL DEFAULT 0,
      status        TEXT NOT NULL DEFAULT 'WAITING',
      tableId       TEXT,
      seatedAt      TEXT
    )
  `)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureTables()

  const status = req.nextUrl.searchParams.get('status') ?? 'WAITING'

  const rows = await query(
    `SELECT * FROM WaitlistEntry WHERE storeId=? AND status=? ORDER BY addedAt ASC`,
    [storeId, status],
  )
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

  const required = ['customerName', 'customerPhone', 'partySize']
  for (const f of required) {
    if (!b[f] && b[f] !== 0) return err(`Field '${f}' is required`, 400, 'MISSING_FIELD')
  }

  const partySize = Number(b.partySize)
  if (!Number.isInteger(partySize) || partySize < 1) {
    return err('partySize must be a positive integer', 400, 'INVALID_VALUE')
  }

  // Calculate position and estimated wait
  const waiting = await query<any>(
    `SELECT id FROM WaitlistEntry WHERE storeId=? AND status='WAITING' ORDER BY addedAt ASC`,
    [storeId],
  )
  const position = waiting.length
  const estimatedWait = position * AVG_MINUTES_PER_PARTY

  const id = newId()
  const now = nowISO()

  await exec(
    `INSERT INTO WaitlistEntry (id,storeId,customerName,customerPhone,partySize,addedAt,estimatedWait,status)
     VALUES (?,?,?,?,?,?,?,'WAITING')`,
    [id, storeId, b.customerName, b.customerPhone, partySize, now, estimatedWait],
  )

  // SMS/notification stub
  console.log(`[NOTIFICATION] Waitlist entry ${id} added for ${b.customerName} (${b.customerPhone}), estimated wait: ${estimatedWait} min`)

  const row = await queryOne(`SELECT * FROM WaitlistEntry WHERE id=?`, [id])
  return NextResponse.json(row, { status: 201 })
}
