// GET/POST /api/pos-sessions — POS terminal session management
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function ensurePOSSessionTables() {
  await exec(`CREATE TABLE IF NOT EXISTS POSSession (
    id            TEXT PRIMARY KEY,
    storeId       TEXT NOT NULL,
    terminalId    TEXT NOT NULL DEFAULT 'POS-1',
    userId        TEXT NOT NULL DEFAULT '',
    openedAt      TEXT NOT NULL,
    closedAt      TEXT,
    openingFloat  REAL NOT NULL DEFAULT 0,
    closingFloat  REAL NOT NULL DEFAULT 0,
    expectedCash  REAL NOT NULL DEFAULT 0,
    actualCash    REAL NOT NULL DEFAULT 0,
    variance      REAL NOT NULL DEFAULT 0,
    status        TEXT NOT NULL DEFAULT 'OPEN'
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS POSCashMovement (
    id        TEXT PRIMARY KEY,
    sessionId TEXT NOT NULL,
    storeId   TEXT NOT NULL,
    type      TEXT NOT NULL,
    amount    REAL NOT NULL DEFAULT 0,
    balance   REAL NOT NULL DEFAULT 0,
    note      TEXT,
    createdAt TEXT NOT NULL
  )`)
}

// GET /api/pos-sessions?storeId=xxx&status=OPEN
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const sp = req.nextUrl.searchParams
  const storeId = sp.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensurePOSSessionTables()

  const status = sp.get('status')
  let sql = `SELECT * FROM POSSession WHERE storeId = ?`
  const params: any[] = [storeId]
  if (status) { sql += ` AND status = ?`; params.push(status) }
  sql += ` ORDER BY openedAt DESC`

  const rows = await query(sql, params)
  return ok(rows)
}

// POST /api/pos-sessions — open a new POS session
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const sp = req.nextUrl.searchParams
  const storeId = sp.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensurePOSSessionTables()

  const b = (await req.json()) as any
  const terminalId: string = b.terminalId ?? 'POS-1'
  const openingFloat = Number(b.openingFloat ?? 0)
  if (openingFloat < 0) return err('Modal awal tidak boleh negatif', 400, 'INVALID_FIELD')

  // Only one OPEN session per terminal per store
  const open = await query(
    `SELECT id FROM POSSession WHERE storeId = ? AND terminalId = ? AND status = 'OPEN'`,
    [storeId, terminalId],
  ) as any[]
  if (open.length > 0) {
    return err('Sesi POS sudah terbuka untuk terminal ini', 400, 'SESSION_ALREADY_OPEN')
  }

  const id = newId()
  const now = nowISO()
  const userId: string = (user.id ?? user.email ?? '')

  await exec(
    `INSERT INTO POSSession (id, storeId, terminalId, userId, openedAt, openingFloat, closingFloat, expectedCash, actualCash, variance, status)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, 0, 0, 'OPEN')`,
    [id, storeId, terminalId, userId, now, openingFloat, openingFloat],
  )

  // Seed opening float movement
  await exec(
    `INSERT INTO POSCashMovement (id, sessionId, storeId, type, amount, balance, note, createdAt)
     VALUES (?, ?, ?, 'FLOAT', ?, ?, 'Modal awal sesi', ?)`,
    [newId(), id, storeId, openingFloat, openingFloat, now],
  )

  return ok({ id }, 201)
}
