import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function ensureReservationTables() {
  await exec(`CREATE TABLE IF NOT EXISTS Reservation (
    id            TEXT PRIMARY KEY,
    storeId       TEXT NOT NULL,
    customerId    TEXT,
    customerName  TEXT NOT NULL,
    customerPhone TEXT NOT NULL,
    tableId       TEXT NOT NULL,
    partySize     INTEGER NOT NULL,
    date          TEXT NOT NULL,
    timeSlot      TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'PENDING',
    notes         TEXT,
    createdAt     TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS TableLayout (
    id       TEXT PRIMARY KEY,
    storeId  TEXT NOT NULL,
    number   TEXT NOT NULL,
    capacity INTEGER NOT NULL DEFAULT 2,
    section  TEXT NOT NULL DEFAULT '',
    active   INTEGER NOT NULL DEFAULT 1,
    createdAt TEXT NOT NULL
  )`)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any
  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureReservationTables()

  const date = req.nextUrl.searchParams.get('date')
  const status = req.nextUrl.searchParams.get('status')

  let sql = `SELECT * FROM Reservation WHERE storeId = ?`
  const params: any[] = [storeId]
  if (date) { sql += ` AND date = ?`; params.push(date) }
  if (status) { sql += ` AND status = ?`; params.push(status) }
  sql += ` ORDER BY date, timeSlot`

  const rows = await query(sql, params)
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any
  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  const body = await req.json() as any
  const { customerId, customerName, customerPhone, tableId, partySize, date, timeSlot, notes } = body

  if (!customerName || !customerPhone || !tableId || !partySize || !date || !timeSlot) {
    return err('customerName, customerPhone, tableId, partySize, date, timeSlot required', 400, 'MISSING_FIELD')
  }

  await ensureReservationTables()

  // Conflict check
  const conflicts = await query(
    `SELECT id FROM Reservation WHERE storeId = ? AND tableId = ? AND date = ? AND timeSlot = ? AND status NOT IN ('CANCELLED','NO_SHOW','COMPLETED')`,
    [storeId, tableId, date, timeSlot],
  )
  if ((conflicts as any[]).length > 0) {
    return err('Table already reserved for that date and time slot', 409, 'CONFLICT')
  }

  // Capacity check
  const tables = await query(`SELECT capacity FROM TableLayout WHERE id = ? AND storeId = ?`, [tableId, storeId])
  if ((tables as any[]).length > 0) {
    const cap = (tables as any[])[0].capacity
    if (Number(partySize) > cap) {
      return err(`Party size ${partySize} exceeds table capacity ${cap}`, 400, 'CAPACITY_EXCEEDED')
    }
  }

  const id = newId()
  const createdAt = nowISO()

  await exec(
    `INSERT INTO Reservation (id, storeId, customerId, customerName, customerPhone, tableId, partySize, date, timeSlot, status, notes, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)`,
    [id, storeId, customerId ?? null, customerName, customerPhone, tableId, partySize, date, timeSlot, notes ?? null, createdAt],
  )

  const row = await query(`SELECT * FROM Reservation WHERE id = ?`, [id])
  return NextResponse.json((row as any[])[0], { status: 201 })
}
