import { NextRequest, NextResponse } from 'next/server'
import { query, exec, newId, nowISO } from '@/lib/db'
import { ensureAttendanceTables } from '../route'
import { calcLateMinutes, determineAttendanceStatus } from '@/lib/attendance'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function POST(req: NextRequest) {
  try {
    await ensureAttendanceTables()
    const b = await req.json() as any
    const { storeId, employeeId, notes = '' } = b

    if (!storeId || !employeeId) return err('storeId and employeeId required')

    const now = nowISO()
    const today = now.slice(0, 10) // YYYY-MM-DD

    // Check if already clocked in today
    const existing = await query(
      `SELECT id, clockIn FROM Attendance WHERE storeId = ? AND employeeId = ? AND date = ?`,
      [storeId, employeeId, today]
    )
    if (existing.length > 0 && (existing[0] as any).clockIn) {
      return err('Already clocked in today', 409)
    }

    // Load setting
    const settingRows = await query(
      `SELECT * FROM AttendanceSetting WHERE storeId = ?`, [storeId]
    )
    const setting = (settingRows[0] as any) ?? {
      workStartTime: '08:00', workEndTime: '17:00',
      lateThresholdMinutes: 15, graceMinutes: 10,
    }

    const lateMinutes = calcLateMinutes(now, setting)
    const status = determineAttendanceStatus(now, null, setting)

    if (existing.length > 0) {
      // Record exists but no clockIn (e.g. pre-created absent record)
      await exec(
        `UPDATE Attendance SET clockIn = ?, status = ?, lateMinutes = ?, notes = ?, updatedAt = ? WHERE id = ?`,
        [now, status, lateMinutes, notes, now, (existing[0] as any).id]
      )
      return NextResponse.json({ id: (existing[0] as any).id, clockIn: now, status, lateMinutes })
    }

    const id = newId()
    await exec(
      `INSERT INTO Attendance (id, storeId, employeeId, date, clockIn, clockOut, status, lateMinutes, earlyLeaveMinutes, notes, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?, 0, ?, ?, ?)`,
      [id, storeId, employeeId, today, now, status, lateMinutes, notes, now, now]
    )
    return NextResponse.json({ id, clockIn: now, status, lateMinutes }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
