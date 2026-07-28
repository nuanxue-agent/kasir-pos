import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function ensureCashDrawerTables() {
  await exec(`CREATE TABLE IF NOT EXISTS CashDrawer (
    id           TEXT PRIMARY KEY,
    storeId      TEXT NOT NULL,
    shiftId      TEXT,
    openedAt     TEXT NOT NULL,
    closedAt     TEXT,
    openingFloat REAL NOT NULL DEFAULT 0,
    expectedCash REAL NOT NULL DEFAULT 0,
    actualCash   REAL NOT NULL DEFAULT 0,
    variance     REAL NOT NULL DEFAULT 0,
    closedBy     TEXT,
    status       TEXT NOT NULL DEFAULT 'OPEN'
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS CashMovement (
    id        TEXT PRIMARY KEY,
    drawerId  TEXT NOT NULL,
    storeId   TEXT NOT NULL,
    type      TEXT NOT NULL,
    amount    REAL NOT NULL DEFAULT 0,
    reference TEXT,
    note      TEXT,
    createdAt TEXT NOT NULL
  )`)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const sp = req.nextUrl.searchParams
  const storeId = sp.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureCashDrawerTables()

  const status = sp.get('status')
  let sql = `SELECT * FROM CashDrawer WHERE storeId = ?`
  const params: any[] = [storeId]
  if (status) { sql += ` AND status = ?`; params.push(status) }
  sql += ` ORDER BY openedAt DESC`

  const rows = await query(sql, params)
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const sp = req.nextUrl.searchParams
  const storeId = sp.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureCashDrawerTables()

  // Only one drawer open at a time per store
  const open = await query(
    `SELECT id FROM CashDrawer WHERE storeId = ? AND status = 'OPEN'`,
    [storeId],
  )
  if ((open as any[]).length > 0) {
    return err('Sudah ada laci kasir yang terbuka', 400, 'DRAWER_ALREADY_OPEN')
  }

  const b = (await req.json()) as any
  const openingFloat = Number(b.openingFloat ?? 0)
  if (openingFloat < 0) return err('Modal awal tidak boleh negatif', 400, 'INVALID_FIELD')

  const id = newId()
  const now = nowISO()
  await exec(
    `INSERT INTO CashDrawer (id, storeId, shiftId, openedAt, openingFloat, expectedCash, actualCash, variance, status)
     VALUES (?, ?, ?, ?, ?, ?, 0, 0, 'OPEN')`,
    [id, storeId, b.shiftId ?? null, now, openingFloat, openingFloat],
  )

  // Seed an opening float movement
  await exec(
    `INSERT INTO CashMovement (id, drawerId, storeId, type, amount, reference, note, createdAt)
     VALUES (?, ?, ?, 'FLOAT_ADD', ?, NULL, 'Modal awal', ?)`,
    [newId(), id, storeId, openingFloat, now],
  )

  return NextResponse.json({ id }, { status: 201 })
}
