import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { ensureAttendanceTables } from '../route'
import { calcAllEmployeeSummaries, calcWorkingMinutes } from '@/lib/attendance'
import type { AttendanceRecord } from '@/lib/attendance'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function GET(req: NextRequest) {
  try {
    await ensureAttendanceTables()
    const sp = req.nextUrl.searchParams
    const storeId = sp.get('storeId')
    const month = sp.get('month')  // YYYY-MM

    if (!storeId) return err('storeId required')
    if (!month)   return err('month required (YYYY-MM)')

    // Fetch all attendance records for the month
    const rows = await query(
      `SELECT a.*, e.name as employeeName
       FROM Attendance a
       LEFT JOIN Employee e ON e.id = a.employeeId
       WHERE a.storeId = ? AND strftime('%Y-%m', a.date) = ?
       ORDER BY a.date ASC`,
      [storeId, month]
    ) as any[]

    // Build employee name map
    const nameMap: Record<string, string> = {}
    for (const r of rows) {
      if (r.employeeId && r.employeeName) nameMap[r.employeeId] = r.employeeName
    }

    const records: AttendanceRecord[] = rows.map((r) => ({
      id: r.id,
      storeId: r.storeId,
      employeeId: r.employeeId,
      date: r.date,
      clockIn: r.clockIn ?? null,
      clockOut: r.clockOut ?? null,
      status: r.status,
      lateMinutes: r.lateMinutes ?? 0,
      earlyLeaveMinutes: r.earlyLeaveMinutes ?? 0,
      notes: r.notes ?? '',
    }))

    const summaries = calcAllEmployeeSummaries(records, month, nameMap)

    // Add average daily hours per employee
    const enriched = summaries.map((s) => ({
      ...s,
      avgDailyWorkingHours: s.presentDays > 0
        ? Math.round((s.totalWorkingMinutes / s.presentDays / 60) * 10) / 10
        : 0,
    }))

    return NextResponse.json({ month, data: enriched })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
