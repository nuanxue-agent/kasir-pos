import { NextRequest, NextResponse } from 'next/server'
import { query, exec, newId, nowISO } from '@/lib/db'

async function ensureTable() {
  await exec(`CREATE TABLE IF NOT EXISTS ScheduledShift (
    id TEXT PRIMARY KEY,
    storeId TEXT NOT NULL,
    employeeId TEXT NOT NULL,
    date TEXT NOT NULL,
    startTime TEXT NOT NULL,
    endTime TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'CASHIER',
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'SCHEDULED',
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`)
}

export async function GET(req: NextRequest) {
  try {
    await ensureTable()
    const { searchParams } = new URL(req.url)
    const storeId = searchParams.get('storeId')
    const week = searchParams.get('week')
    const employeeId = searchParams.get('employeeId')
    if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 })

    let sql = `SELECT s.*, e.name as employeeName FROM ScheduledShift s
      LEFT JOIN Employee e ON e.id = s.employeeId
      WHERE s.storeId = ?`
    const params: any[] = [storeId]

    if (week) {
      const start = week
      const end = new Date(new Date(week).getTime() + 6 * 86400000).toISOString().slice(0, 10)
      sql += ` AND s.date >= ? AND s.date <= ?`
      params.push(start, end)
    }
    if (employeeId) {
      sql += ` AND s.employeeId = ?`
      params.push(employeeId)
    }

    sql += ` ORDER BY s.date, s.startTime`
    const rows = await query(sql, params)
    return NextResponse.json(rows)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureTable()
    const body = await req.json() as {
      storeId?: string; employeeId?: string; date?: string
      startTime?: string; endTime?: string; role?: string; notes?: string; status?: string
    }
    const { storeId, employeeId, date, startTime, endTime, role = 'CASHIER', notes = '', status = 'SCHEDULED' } = body
    if (!storeId || !employeeId || !date || !startTime || !endTime) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Conflict detection: employee can't have overlapping shifts on same date
    const conflicts = await query(
      `SELECT id FROM ScheduledShift
       WHERE storeId = ? AND employeeId = ? AND date = ? AND status != 'CANCELLED'
         AND startTime < ? AND endTime > ?`,
      [storeId, employeeId, date, endTime, startTime]
    ) as any[]
    if (conflicts.length > 0) {
      return NextResponse.json({ error: 'Shift overlaps with an existing shift for this employee' }, { status: 409 })
    }

    const id = newId()
    const now = nowISO()
    await exec(
      `INSERT INTO ScheduledShift (id, storeId, employeeId, date, startTime, endTime, role, notes, status, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, storeId, employeeId, date, startTime, endTime, role, notes, status, now, now]
    )
    return NextResponse.json({ id }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
