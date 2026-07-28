import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function ensurePerformanceScoreTable() {
  await exec(`CREATE TABLE IF NOT EXISTS PerformanceScore (
    id              TEXT PRIMARY KEY,
    storeId         TEXT NOT NULL,
    employeeId      TEXT NOT NULL,
    period          TEXT NOT NULL,
    salesScore      REAL NOT NULL DEFAULT 0,
    attendanceScore REAL NOT NULL DEFAULT 0,
    customerScore   REAL NOT NULL DEFAULT 0,
    overallScore    REAL NOT NULL DEFAULT 0,
    rank            INTEGER NOT NULL DEFAULT 0,
    badge           TEXT NOT NULL DEFAULT 'BRONZE',
    createdAt       TEXT NOT NULL,
    updatedAt       TEXT NOT NULL
  )`)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  const period = req.nextUrl.searchParams.get('period') ?? ''

  await ensurePerformanceScoreTable()

  let rows: any[]
  if (period) {
    rows = await query(
      `SELECT ps.*, e.name as employeeName
       FROM PerformanceScore ps
       LEFT JOIN Employee e ON ps.employeeId = e.id
       WHERE ps.storeId = ? AND ps.period = ?
       ORDER BY ps.rank ASC`,
      [storeId, period],
    )
  } else {
    rows = await query(
      `SELECT ps.*, e.name as employeeName
       FROM PerformanceScore ps
       LEFT JOIN Employee e ON ps.employeeId = e.id
       WHERE ps.storeId = ?
       ORDER BY ps.period DESC, ps.rank ASC`,
      [storeId],
    )
  }

  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensurePerformanceScoreTable()

  const b = (await req.json()) as any
  if (!b.employeeId) return err("Field 'employeeId' is required", 400, 'MISSING_FIELD')
  if (!b.period) return err("Field 'period' is required", 400, 'MISSING_FIELD')

  const salesScore = Number(b.salesScore ?? 0)
  const attendanceScore = Number(b.attendanceScore ?? 0)
  const customerScore = Number(b.customerScore ?? 0)
  const overallScore = Number(b.overallScore ?? 0)
  const badge = b.badge ?? 'BRONZE'

  // Upsert: check existing for same employee+period
  const existing = await query(
    `SELECT id FROM PerformanceScore WHERE storeId = ? AND employeeId = ? AND period = ?`,
    [storeId, b.employeeId, b.period],
  )

  const t = nowISO()

  if ((existing as any[]).length > 0) {
    const existingId = (existing as any[])[0].id
    await exec(
      `UPDATE PerformanceScore SET salesScore=?, attendanceScore=?, customerScore=?, overallScore=?, badge=?, updatedAt=? WHERE id=?`,
      [salesScore, attendanceScore, customerScore, overallScore, badge, t, existingId],
    )
    // Re-rank all entries for this period
    await reRankPeriod(storeId, b.period)
    return NextResponse.json({ id: existingId }, { status: 200 })
  }

  const id = newId()
  await exec(
    `INSERT INTO PerformanceScore (id, storeId, employeeId, period, salesScore, attendanceScore, customerScore, overallScore, rank, badge, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    [id, storeId, b.employeeId, b.period, salesScore, attendanceScore, customerScore, overallScore, badge, t, t],
  )

  await reRankPeriod(storeId, b.period)

  return NextResponse.json({ id }, { status: 201 })
}

/**
 * Recompute sequential ranks for all entries in a period, sorted by
 * overallScore DESC then salesScore DESC (tie-breaker).
 */
async function reRankPeriod(storeId: string, period: string) {
  const rows = await query(
    `SELECT id, overallScore, salesScore FROM PerformanceScore WHERE storeId = ? AND period = ? ORDER BY overallScore DESC, salesScore DESC`,
    [storeId, period],
  )
  const t = nowISO()
  for (let i = 0; i < (rows as any[]).length; i++) {
    await exec(
      `UPDATE PerformanceScore SET rank = ?, updatedAt = ? WHERE id = ?`,
      [i + 1, t, (rows as any[])[i].id],
    )
  }
}
