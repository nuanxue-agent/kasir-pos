import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import { ensurePerformanceScoreTable } from '../route'
import {
  calcOverallScore,
  calcBadge,
  calcSalesScore,
  calcAttendanceScore,
  calcCustomerScore,
} from '@/lib/performance-score'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

/**
 * POST /api/hr/performance-scores/compute?storeId=
 * Body: { period: 'YYYY-MM' }
 *
 * Auto-computes scores for all employees in the store based on:
 * - Sales: actual vs target from SalesTarget/SalesAchievement (falls back to Orders)
 * - Attendance: present days from Attendance table
 * - Customer: avg rating from CustomerFeedback or Order ratings (falls back to 75)
 *
 * Upserts one PerformanceScore per employee per period.
 */
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  const b = (await req.json()) as any
  const period: string = b.period ?? nowISO().slice(0, 7) // default: current month

  // Validate YYYY-MM format
  if (!/^\d{4}-\d{2}$/.test(period)) return err('period must be YYYY-MM', 400, 'INVALID_FIELD')

  await ensurePerformanceScoreTable()

  // Derive date range from period
  const [year, month] = period.split('-').map(Number)
  const periodStart = `${period}-01`
  const nextMonth = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`

  // Fetch all employees for this store
  const employees = await query(
    `SELECT id, name FROM Employee WHERE storeId = ? AND (active = 1 OR active IS NULL)`,
    [storeId],
  ).catch(() => [] as any[])

  if ((employees as any[]).length === 0) {
    return NextResponse.json({ count: 0, message: 'No employees found' })
  }

  // Count working days in the period (Mon–Sat = 6 days/week, rough estimate)
  const daysInMonth = new Date(year, month, 0).getDate()
  const workingDays = Math.round(daysInMonth * (6 / 7))

  const t = nowISO()
  let count = 0

  for (const emp of employees as any[]) {
    const empId: string = emp.id

    // ── Sales score ──────────────────────────────────────────────────────────
    // Try SalesTarget / SalesAchievement tables first
    let rawSalesScore = 0
    try {
      const targetRows = await query(
        `SELECT targetValue FROM SalesTarget
         WHERE storeId = ? AND employeeId = ? AND targetType = 'EMPLOYEE'
           AND period = 'MONTHLY' AND periodStart <= ? AND periodEnd >= ?
         LIMIT 1`,
        [storeId, empId, periodStart, periodStart],
      )
      const target = (targetRows as any[])[0]?.targetValue ?? 0

      const actualRows = await query(
        `SELECT COALESCE(SUM(total), 0) as total FROM Orders
         WHERE storeId = ? AND employeeId = ? AND status = 'completed'
           AND createdAt >= ? AND createdAt < ?`,
        [storeId, empId, periodStart, nextMonth],
      ).catch(() => [{ total: 0 }])
      const actual = (actualRows as any[])[0]?.total ?? 0

      rawSalesScore = target > 0 ? calcSalesScore(actual, target) : 60 // neutral if no target
    } catch {
      rawSalesScore = 60
    }

    // ── Attendance score ─────────────────────────────────────────────────────
    let rawAttendanceScore = 0
    try {
      const attRows = await query(
        `SELECT COUNT(*) as presentCount FROM Attendance
         WHERE storeId = ? AND employeeId = ? AND status IN ('PRESENT', 'LATE', 'HALF_DAY')
           AND date >= ? AND date < ?`,
        [storeId, empId, periodStart, nextMonth],
      )
      const presentDays = (attRows as any[])[0]?.presentCount ?? 0
      rawAttendanceScore = calcAttendanceScore(presentDays, workingDays)
    } catch {
      rawAttendanceScore = 70
    }

    // ── Customer score ───────────────────────────────────────────────────────
    // Use avg order rating if available, else neutral 75
    let rawCustomerScore = 75
    try {
      const ratingRows = await query(
        `SELECT AVG(rating) as avgRating FROM Orders
         WHERE storeId = ? AND employeeId = ? AND rating IS NOT NULL
           AND createdAt >= ? AND createdAt < ?`,
        [storeId, empId, periodStart, nextMonth],
      )
      const avg = (ratingRows as any[])[0]?.avgRating
      if (avg != null) rawCustomerScore = calcCustomerScore(Number(avg))
    } catch {
      rawCustomerScore = 75
    }

    const overallScore = calcOverallScore({
      salesScore: rawSalesScore,
      attendanceScore: rawAttendanceScore,
      customerScore: rawCustomerScore,
    })
    const badge = calcBadge(overallScore)

    // Upsert
    const existing = await query(
      `SELECT id FROM PerformanceScore WHERE storeId = ? AND employeeId = ? AND period = ?`,
      [storeId, empId, period],
    )

    if ((existing as any[]).length > 0) {
      await exec(
        `UPDATE PerformanceScore SET salesScore=?, attendanceScore=?, customerScore=?, overallScore=?, badge=?, updatedAt=? WHERE id=?`,
        [rawSalesScore, rawAttendanceScore, rawCustomerScore, overallScore, badge, t, (existing as any[])[0].id],
      )
    } else {
      const id = newId()
      await exec(
        `INSERT INTO PerformanceScore (id, storeId, employeeId, period, salesScore, attendanceScore, customerScore, overallScore, rank, badge, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
        [id, storeId, empId, period, rawSalesScore, rawAttendanceScore, rawCustomerScore, overallScore, badge, t, t],
      )
    }
    count++
  }

  // Re-rank all entries for this period
  const allRows = await query(
    `SELECT id, overallScore, salesScore FROM PerformanceScore WHERE storeId = ? AND period = ? ORDER BY overallScore DESC, salesScore DESC`,
    [storeId, period],
  )
  for (let i = 0; i < (allRows as any[]).length; i++) {
    await exec(
      `UPDATE PerformanceScore SET rank = ?, updatedAt = ? WHERE id = ?`,
      [i + 1, t, (allRows as any[])[i].id],
    )
  }

  return NextResponse.json({ count, period })
}
