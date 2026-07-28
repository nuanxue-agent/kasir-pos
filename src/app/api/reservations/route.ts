// GET /api/reservations?storeId=&date=
// POST /api/reservations
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, queryOne, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

async function ensureTables() {
  await exec(`
    CREATE TABLE IF NOT EXISTS Reservation (
      id            TEXT PRIMARY KEY,
      storeId       TEXT NOT NULL,
      tableId       TEXT NOT NULL,
      customerName  TEXT NOT NULL,
      customerPhone TEXT NOT NULL,
      partySize     INTEGER NOT NULL,
      date          TEXT NOT NULL,
      time          TEXT NOT NULL,
      duration      INTEGER NOT NULL DEFAULT 90,
      status        TEXT NOT NULL DEFAULT 'PENDING',
      notes         TEXT,
      createdAt     TEXT NOT NULL,
      updatedAt     TEXT NOT NULL
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

  const date = req.nextUrl.searchParams.get('date')
  const tableId = req.nextUrl.searchParams.get('tableId')
  const status = req.nextUrl.searchParams.get('status')

  let sql = `SELECT * FROM Reservation WHERE storeId=?`
  const params: any[] = [storeId]

  if (date) { sql += ` AND date=?`; params.push(date) }
  if (tableId) { sql += ` AND tableId=?`; params.push(tableId) }
  if (status) { sql += ` AND status=?`; params.push(status) }

  sql += ` ORDER BY date ASC, time ASC`

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

  const required = ['tableId', 'customerName', 'customerPhone', 'partySize', 'date', 'time']
  for (const f of required) {
    if (!b[f] && b[f] !== 0) return err(`Field '${f}' is required`, 400, 'MISSING_FIELD')
  }

  const partySize = Number(b.partySize)
  if (!Number.isInteger(partySize) || partySize < 1) {
    return err('partySize must be a positive integer', 400, 'INVALID_VALUE')
  }

  const duration = Number(b.duration ?? 90)
  if (isNaN(duration) || duration < 1) {
    return err('duration must be a positive number (minutes)', 400, 'INVALID_VALUE')
  }

  // Conflict check: same table, overlapping datetime
  const datetime = `${b.date}T${b.time}`
  const start = new Date(datetime).getTime()
  const end = start + duration * 60_000

  const existing = await query<any>(
    `SELECT id, date, time, duration, status FROM Reservation
     WHERE storeId=? AND tableId=? AND date=? AND status NOT IN ('CANCELLED','NO_SHOW')`,
    [storeId, b.tableId, b.date],
  )

  for (const r of existing) {
    const rStart = new Date(`${r.date}T${r.time}`).getTime()
    const rEnd = rStart + r.duration * 60_000
    if (start < rEnd && end > rStart) {
      return err('Table already has a reservation at that time', 409, 'CONFLICT')
    }
  }

  const id = newId()
  const now = nowISO()
  const validStatuses = ['PENDING', 'CONFIRMED', 'SEATED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']
  const status = validStatuses.includes(b.status) ? b.status : 'PENDING'

  await exec(
    `INSERT INTO Reservation
       (id,storeId,tableId,customerName,customerPhone,partySize,date,time,duration,status,notes,createdAt,updatedAt)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, storeId, b.tableId, b.customerName, b.customerPhone, partySize,
     b.date, b.time, duration, status, b.notes ?? null, now, now],
  )

  // SMS/notification stub
  console.log(`[NOTIFICATION] Reservation ${id} created for ${b.customerName} (${b.customerPhone}) on ${b.date} ${b.time}`)

  const row = await queryOne(`SELECT * FROM Reservation WHERE id=?`, [id])
  return NextResponse.json(row, { status: 201 })
}
