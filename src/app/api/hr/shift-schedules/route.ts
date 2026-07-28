import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function ensureShiftScheduleTables() {
  await exec(`CREATE TABLE IF NOT EXISTS ShiftSchedule (
    id         TEXT PRIMARY KEY,
    storeId    TEXT NOT NULL,
    weekStart  TEXT NOT NULL,
    employeeId TEXT NOT NULL,
    shiftId    TEXT NOT NULL,
    dayOfWeek  INTEGER NOT NULL,
    status     TEXT NOT NULL DEFAULT 'SCHEDULED',
    createdAt  TEXT NOT NULL,
    updatedAt  TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS ShiftSwapRequest (
    id          TEXT PRIMARY KEY,
    storeId     TEXT NOT NULL,
    requesterId TEXT NOT NULL,
    targetId    TEXT NOT NULL,
    scheduleId  TEXT NOT NULL,
    reason      TEXT NOT NULL DEFAULT '',
    status      TEXT NOT NULL DEFAULT 'PENDING',
    requestedAt TEXT NOT NULL,
    updatedAt   TEXT NOT NULL
  )`)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)
  const user = session.user as any

  const sp = req.nextUrl.searchParams
  const storeId = sp.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required')

  const weekStart = sp.get('weekStart')

  await ensureShiftScheduleTables()

  let sql = `
    SELECT ss.*,
      e.name  AS employeeName,
      sh.name AS shiftName,
      sh.startTime AS shiftStart,
      sh.endTime   AS shiftEnd
    FROM ShiftSchedule ss
    LEFT JOIN Employee e  ON e.id  = ss.employeeId
    LEFT JOIN Shift    sh ON sh.id = ss.shiftId
    WHERE ss.storeId = ?`
  const params: any[] = [storeId]

  if (weekStart) {
    sql += ` AND ss.weekStart = ?`
    params.push(weekStart)
  }

  sql += ` ORDER BY ss.weekStart DESC, ss.dayOfWeek ASC`

  const rows = await query(sql, params)
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)
  const user = session.user as any

  const sp = req.nextUrl.searchParams
  const storeId = sp.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required')

  await ensureShiftScheduleTables()

  const b = (await req.json()) as any

  const { weekStart, employeeId, shiftId, dayOfWeek, status = 'SCHEDULED' } = b

  if (!weekStart || !employeeId || !shiftId || dayOfWeek === undefined) {
    return err('weekStart, employeeId, shiftId, dayOfWeek are required')
  }

  if (dayOfWeek < 0 || dayOfWeek > 6) {
    return err('dayOfWeek must be 0–6')
  }

  const validStatuses = ['SCHEDULED', 'CONFIRMED', 'SWAPPED', 'ABSENT']
  if (!validStatuses.includes(status)) {
    return err(`status must be one of ${validStatuses.join(', ')}`)
  }

  // Conflict check: same employee, same week, same day, not ABSENT
  const conflicts = (await query(
    `SELECT id FROM ShiftSchedule
     WHERE storeId = ? AND employeeId = ? AND weekStart = ? AND dayOfWeek = ?
       AND status != 'ABSENT'`,
    [storeId, employeeId, weekStart, dayOfWeek],
  )) as any[]

  if (conflicts.length > 0) {
    return NextResponse.json(
      { error: 'Employee already has a shift on this day' },
      { status: 409 },
    )
  }

  const t = nowISO()
  const id = newId()
  await exec(
    `INSERT INTO ShiftSchedule (id, storeId, weekStart, employeeId, shiftId, dayOfWeek, status, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, storeId, weekStart, employeeId, shiftId, dayOfWeek, status, t, t],
  )

  return NextResponse.json({ id }, { status: 201 })
}
