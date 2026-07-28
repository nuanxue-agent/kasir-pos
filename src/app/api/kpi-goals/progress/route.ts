// API route: GET /api/kpi-goals/progress
// Returns KPI goals with computed actual vs target for the current period
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

type KpiMetric = 'REVENUE' | 'ORDERS' | 'CUSTOMERS' | 'AVG_ORDER' | 'REPEAT_RATE'
type KpiPeriod = 'MONTHLY' | 'QUARTERLY' | 'YEARLY'
type GoalStatus = 'ON_TRACK' | 'AT_RISK' | 'ACHIEVED' | 'MISSED'

function calcAchievementPct(actual: number, target: number): number {
  if (target <= 0) return actual > 0 ? 100 : 0
  return (actual / target) * 100
}

function calcGoalStatus(
  achievementPct: number,
  periodEndDate: Date,
  now: Date,
): GoalStatus {
  if (achievementPct >= 100) return 'ACHIEVED'
  if (now > periodEndDate) return 'MISSED'
  if (achievementPct >= 70) return 'ON_TRACK'
  return 'AT_RISK'
}

function getPeriodDateRange(
  period: KpiPeriod,
  year: number,
  month: number | null,
  quarter: number | null,
): { startDate: Date; endDate: Date } {
  if (period === 'MONTHLY' && month !== null) {
    return {
      startDate: new Date(year, month - 1, 1),
      endDate: new Date(year, month, 0, 23, 59, 59, 999),
    }
  }
  if (period === 'QUARTERLY' && quarter !== null) {
    const startMonth = (quarter - 1) * 3
    return {
      startDate: new Date(year, startMonth, 1),
      endDate: new Date(year, startMonth + 3, 0, 23, 59, 59, 999),
    }
  }
  return {
    startDate: new Date(year, 0, 1),
    endDate: new Date(year, 11, 31, 23, 59, 59, 999),
  }
}

function getPrevPeriodRange(
  period: KpiPeriod,
  year: number,
  month: number | null,
  quarter: number | null,
): { startDate: Date; endDate: Date } {
  if (period === 'MONTHLY' && month !== null) {
    const prevMonth = month === 1 ? 12 : month - 1
    const prevYear = month === 1 ? year - 1 : year
    return getPeriodDateRange('MONTHLY', prevYear, prevMonth, null)
  }
  if (period === 'QUARTERLY' && quarter !== null) {
    const prevQ = quarter === 1 ? 4 : quarter - 1
    const prevYear = quarter === 1 ? year - 1 : year
    return getPeriodDateRange('QUARTERLY', prevYear, null, prevQ)
  }
  return getPeriodDateRange('YEARLY', year - 1, null, null)
}

async function computeActual(
  storeId: string,
  metric: KpiMetric,
  startDate: Date,
  endDate: Date,
): Promise<number> {
  const from = startDate.toISOString()
  const to = endDate.toISOString()

  if (metric === 'REVENUE') {
    const rows = await query<any>(
      `SELECT COALESCE(SUM(total), 0) as val FROM "Order"
       WHERE storeId = ? AND status = 'COMPLETED' AND createdAt >= ? AND createdAt <= ?`,
      [storeId, from, to],
    )
    return Number(rows[0]?.val ?? 0)
  }

  if (metric === 'ORDERS') {
    const rows = await query<any>(
      `SELECT COUNT(*) as val FROM "Order"
       WHERE storeId = ? AND status = 'COMPLETED' AND createdAt >= ? AND createdAt <= ?`,
      [storeId, from, to],
    )
    return Number(rows[0]?.val ?? 0)
  }

  if (metric === 'CUSTOMERS') {
    const rows = await query<any>(
      `SELECT COUNT(DISTINCT customerId) as val FROM "Order"
       WHERE storeId = ? AND status = 'COMPLETED' AND customerId IS NOT NULL
         AND createdAt >= ? AND createdAt <= ?`,
      [storeId, from, to],
    )
    return Number(rows[0]?.val ?? 0)
  }

  if (metric === 'AVG_ORDER') {
    const rows = await query<any>(
      `SELECT COALESCE(AVG(total), 0) as val FROM "Order"
       WHERE storeId = ? AND status = 'COMPLETED' AND createdAt >= ? AND createdAt <= ?`,
      [storeId, from, to],
    )
    return Number(rows[0]?.val ?? 0)
  }

  if (metric === 'REPEAT_RATE') {
    // % of orders from customers who have ordered before
    const totalRows = await query<any>(
      `SELECT COUNT(*) as val FROM "Order"
       WHERE storeId = ? AND status = 'COMPLETED' AND customerId IS NOT NULL
         AND createdAt >= ? AND createdAt <= ?`,
      [storeId, from, to],
    )
    const total = Number(totalRows[0]?.val ?? 0)
    if (total === 0) return 0

    const repeatRows = await query<any>(
      `SELECT COUNT(*) as val FROM "Order" o
       WHERE o.storeId = ? AND o.status = 'COMPLETED' AND o.customerId IS NOT NULL
         AND o.createdAt >= ? AND o.createdAt <= ?
         AND EXISTS (
           SELECT 1 FROM "Order" o2
           WHERE o2.customerId = o.customerId AND o2.storeId = o.storeId
             AND o2.status = 'COMPLETED' AND o2.createdAt < o.createdAt
         )`,
      [storeId, from, to],
    )
    const repeat = Number(repeatRows[0]?.val ?? 0)
    return (repeat / total) * 100
  }

  return 0
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)
  const user = session.user as any
  const storeIds: string[] = user.stores?.map((s: any) => s.id) ?? []

  const { searchParams } = new URL(req.url)
  const storeId = searchParams.get('storeId') ?? ''
  const period = searchParams.get('period') ?? ''

  if (!storeId || !storeIds.includes(storeId)) return err('Store not found', 403)

  try {
    // Ensure table exists
    await query(`
      CREATE TABLE IF NOT EXISTS KpiGoal (
        id TEXT PRIMARY KEY, storeId TEXT NOT NULL, metric TEXT NOT NULL,
        period TEXT NOT NULL, target REAL NOT NULL, actual REAL NOT NULL DEFAULT 0,
        year INTEGER NOT NULL, month INTEGER, quarter INTEGER, createdAt TEXT NOT NULL
      )
    `)

    let sql = `SELECT * FROM KpiGoal WHERE storeId = ?`
    const params: any[] = [storeId]
    if (period) {
      sql += ` AND period = ?`
      params.push(period)
    }
    sql += ` ORDER BY createdAt DESC`

    const goals = await query<any>(sql, params)
    const now = new Date()

    const result = await Promise.all(
      goals.map(async (g: any) => {
        const { startDate, endDate } = getPeriodDateRange(
          g.period, g.year, g.month, g.quarter,
        )
        const { startDate: prevStart, endDate: prevEnd } = getPrevPeriodRange(
          g.period, g.year, g.month, g.quarter,
        )

        const [actual, prevActual] = await Promise.all([
          computeActual(storeId, g.metric, startDate, endDate),
          computeActual(storeId, g.metric, prevStart, prevEnd),
        ])

        const achievementPct = calcAchievementPct(actual, g.target)
        const status = calcGoalStatus(achievementPct, endDate, now)
        const trend = prevActual > 0
          ? ((actual - prevActual) / prevActual) * 100
          : null

        // Update actual in DB (fire and forget)
        query(`UPDATE KpiGoal SET actual = ? WHERE id = ?`, [actual, g.id]).catch(() => {})

        return {
          ...g,
          actual,
          achievementPct,
          status,
          trend,
        }
      }),
    )

    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Internal error' }, { status: 500 })
  }
}
