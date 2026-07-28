import { NextRequest, NextResponse } from 'next/server'
import { query, exec, nowISO } from '@/lib/db'
import { ensureAttendanceTables } from '../route'
import { determineAttendanceStatus, calcLateMinutes, calcEarlyLeaveMinutes } from '@/lib/attendance'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    await ensureAttendanceTables()

    const rows = await query(`SELECT * FROM Attendance WHERE id = ?`, [id])
    if (rows.length === 0) return err('Not found', 404)
    const existing = rows[0] as any

    const b = await req.json() as any

    // Load setting for recalculation
    const settingRows = await query(
      `SELECT * FROM AttendanceSetting WHERE storeId = ?`, [existing.storeId]
    )
    const setting = (settingRows[0] as any) ?? {
      workStartTime: '08:00', workEndTime: '17:00',
      lateThresholdMinutes: 15, graceMinutes: 10,
    }

    const clockIn    = b.clockIn    !== undefined ? b.clockIn    : existing.clockIn
    const clockOut   = b.clockOut   !== undefined ? b.clockOut   : existing.clockOut
    const notes      = b.notes      !== undefined ? b.notes      : existing.notes

    const lateMinutes = clockIn ? calcLateMinutes(clockIn, setting) : 0
    const earlyLeaveMinutes = clockOut ? calcEarlyLeaveMinutes(clockOut, setting) : 0
    const status = b.status ?? determineAttendanceStatus(clockIn, clockOut, setting)

    await exec(
      `UPDATE Attendance SET clockIn = ?, clockOut = ?, status = ?, lateMinutes = ?, earlyLeaveMinutes = ?, notes = ?, updatedAt = ? WHERE id = ?`,
      [clockIn, clockOut, status, lateMinutes, earlyLeaveMinutes, notes, nowISO(), id]
    )
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
