import { NextRequest, NextResponse } from 'next/server'
import { query, exec, newId, nowISO } from '@/lib/db'
import { determineAttendanceStatus, calcLateMinutes, calcEarlyLeaveMinutes } from '@/lib/attendance'

export async function ensureAttendanceTables() {
  await exec(`CREATE TABLE IF NOT EXISTS Attendance (
    id TEXT PRIMARY KEY,
    storeId TEXT NOT NULL,
    employeeId TEXT NOT NULL,
    date TEXT NOT NULL,
    clockIn TEXT,
    clockOut TEXT,
    status TEXT NOT NULL DEFAULT 'ABSENT',
    lateMinutes INTEGER NOT NULL DEFAULT 0,
    earlyLeaveMinutes INTEGER NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS AttendanceSetting (
    id TEXT PRIMARY KEY,
    storeId TEXT NOT NULL UNIQUE,
    workStartTime TEXT NOT NULL DEFAULT '08:00',
    workEndTime TEXT NOT NULL DEFAULT '17:00',
    lateThresholdMinutes INTEGER NOT NULL DEFAULT 15,
    graceMinutes INTEGER NOT NULL DEFAULT 10,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`)
}

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function GET(req: NextRequest) {
  try {
    await ensureAttendanceTables()
    const sp = req.nextUrl.searchParams
    const storeId = sp.get('storeId')
    const employeeId = sp.get('employeeId')
    const month = sp.get('month')   // YYYY-MM
    const date = sp.get('date')     // YYYY-MM-DD

    if (!storeId) return err('storeId required')

    let sql = `SELECT a.*, e.name as employeeName
      FROM Attendance a
      LEFT JOIN Employee e ON e.id = a.employeeId
      WHERE a.storeId = ?`
    const params: any[] = [storeId]

    if (employeeId) { sql += ' AND a.employeeId = ?'; params.push(employeeId) }
    if (date)       { sql += ' AND a.date = ?';        params.push(date) }
    if (month)      { sql += " AND strftime('%Y-%m', a.date) = ?"; params.push(month) }

    sql += ' ORDER BY a.date DESC, a.clockIn ASC'

    const rows = await query(sql, params)
    return NextResponse.json({ data: rows })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureAttendanceTables()
    const b = await req.json() as any
    const { storeId, employeeId, date, clockIn, clockOut, status, notes = '' } = b

    if (!storeId || !employeeId || !date) {
      return err('storeId, employeeId, and date are required')
    }

    // Load store attendance settings
    const settingRows = await query(
      `SELECT * FROM AttendanceSetting WHERE storeId = ?`, [storeId]
    )
    const setting = (settingRows[0] as any) ?? {
      workStartTime: '08:00', workEndTime: '17:00',
      lateThresholdMinutes: 15, graceMinutes: 10,
    }

    const lateMinutes = clockIn
      ? calcLateMinutes(clockIn, setting)
      : 0
    const earlyLeaveMinutes = clockOut
      ? calcEarlyLeaveMinutes(clockOut, setting)
      : 0
    const derivedStatus = status ?? determineAttendanceStatus(clockIn ?? null, clockOut ?? null, setting)

    const id = newId()
    const now = nowISO()
    await exec(
      `INSERT INTO Attendance (id, storeId, employeeId, date, clockIn, clockOut, status, lateMinutes, earlyLeaveMinutes, notes, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, storeId, employeeId, date, clockIn ?? null, clockOut ?? null, derivedStatus, lateMinutes, earlyLeaveMinutes, notes, now, now]
    )
    return NextResponse.json({ id }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
