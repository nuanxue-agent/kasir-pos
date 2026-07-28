import { NextRequest, NextResponse } from 'next/server'
import { query, exec, nowISO } from '@/lib/db'
import { ensureAttendanceTables } from '../route'
import { calcEarlyLeaveMinutes, calcLateMinutes, determineAttendanceStatus } from '@/lib/attendance'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function POST(req: NextRequest) {
  try {
    await ensureAttendanceTables()
    const b = await req.json() as any
    const { storeId, employeeId, notes } = b

    if (!storeId || !employeeId) return err('storeId and employeeId required')

    const now = nowISO()
    const today = now.slice(0, 10)

    const rows = await query(
      `SELECT * FROM Attendance WHERE storeId = ? AND employeeId = ? AND date = ?`,
      [storeId, employeeId, today]
    )
    if (rows.length === 0 || !(rows[0] as any).clockIn) {
      return err('No clock-in found for today', 404)
    }
    const record = rows[0] as any
    if (record.clockOut) return err('Already clocked out today', 409)

    // Load setting
    const settingRows = await query(
      `SELECT * FROM AttendanceSetting WHERE storeId = ?`, [storeId]
    )
    const setting = (settingRows[0] as any) ?? {
      workStartTime: '08:00', workEndTime: '17:00',
      lateThresholdMinutes: 15, graceMinutes: 10,
    }

    const earlyLeaveMinutes = calcEarlyLeaveMinutes(now, setting)
    const lateMinutes = record.lateMinutes ?? calcLateMinutes(record.clockIn, setting)
    const status = determineAttendanceStatus(record.clockIn, now, setting)
    const updatedNotes = notes !== undefined ? notes : record.notes

    await exec(
      `UPDATE Attendance SET clockOut = ?, status = ?, lateMinutes = ?, earlyLeaveMinutes = ?, notes = ?, updatedAt = ? WHERE id = ?`,
      [now, status, lateMinutes, earlyLeaveMinutes, updatedNotes, now, record.id]
    )
    return NextResponse.json({ id: record.id, clockOut: now, status, earlyLeaveMinutes })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
