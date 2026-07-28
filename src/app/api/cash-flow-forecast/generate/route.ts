// POST /api/cash-flow-forecast/generate
// Auto-generates a forecast for the next N days based on historical order averages
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import { ensureTables } from '../route'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

// Pure helpers — exported for unit testing
export function calcProjectedBalance(
  openingBalance: number,
  inflow: number,
  outflow: number
): number {
  return openingBalance + inflow - outflow
}

export function applyScenarioDelta(
  base: number,
  scenario: 'best' | 'base' | 'worst',
  deltaFactor = 0.2
): number {
  if (scenario === 'best')  return base * (1 + deltaFactor)
  if (scenario === 'worst') return base * (1 - deltaFactor)
  return base
}

export function calcRunningBalance(
  rows: { projectedInflow: number; projectedOutflow: number }[],
  openingBalance: number
): number[] {
  let running = openingBalance
  return rows.map(r => {
    running = running + r.projectedInflow - r.projectedOutflow
    return running
  })
}

export function calcVariance(projected: number, actual: number): number {
  return actual - projected
}

export function calcVariancePct(projected: number, actual: number): number {
  if (projected === 0) return actual === 0 ? 0 : Infinity
  return ((actual - projected) / Math.abs(projected)) * 100
}

export function isLiquidityWarning(projectedBalance: number, threshold: number): boolean {
  return projectedBalance < threshold
}

export function getScenarioDeltas(
  baseInflow: number,
  baseOutflow: number,
  deltaFactor = 0.2
): { best: { inflow: number; outflow: number }; base: { inflow: number; outflow: number }; worst: { inflow: number; outflow: number } } {
  return {
    best:  { inflow: baseInflow * (1 + deltaFactor), outflow: baseOutflow * (1 - deltaFactor) },
    base:  { inflow: baseInflow,                     outflow: baseOutflow },
    worst: { inflow: baseInflow * (1 - deltaFactor), outflow: baseOutflow * (1 + deltaFactor) },
  }
}

// POST /api/cash-flow-forecast/generate
// Body: { storeId, days, openingBalance, liquidityThreshold, scenario }
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const url = new URL(req.url)
    const storeId = url.searchParams.get('storeId') ?? user.stores?.[0]?.id
    if (!storeId) return err('storeId required')

    const hasAccess = user.stores?.some((s: { id: string }) => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    await ensureTables()

    const b = (await req.json()) as any
    const days             = Math.min(Math.max(Number(b.days ?? 90), 1), 365)
    const openingBalance   = Number(b.openingBalance   ?? 0)
    const liquidityThreshold = Number(b.liquidityThreshold ?? 0)
    const scenario         = (b.scenario ?? 'base') as 'best' | 'base' | 'worst'
    const deltaFactor      = Number(b.deltaFactor ?? 0.2)

    // Derive daily averages from the last 30 days of completed orders
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const salesRows = await query(
      `SELECT COALESCE(SUM(totalAmount), 0) as totalRevenue, COUNT(*) as orderCount
       FROM Orders
       WHERE storeId = ? AND status = 'completed' AND createdAt >= ?`,
      [storeId, thirtyDaysAgo.toISOString()]
    )

    const expenseRows = await query(
      `SELECT COALESCE(SUM(amount), 0) as totalExpenses
       FROM Expense
       WHERE storeId = ? AND createdAt >= ?`,
      [storeId, thirtyDaysAgo.toISOString()]
    ).catch(() => [{ totalExpenses: 0 }]) // Expense table may not exist

    const avgDailyInflow  = ((salesRows[0] as any)?.totalRevenue ?? 0) / 30
    const avgDailyOutflow = ((expenseRows[0] as any)?.totalExpenses ?? 0) / 30

    const deltas = getScenarioDeltas(avgDailyInflow, avgDailyOutflow, deltaFactor)
    const { inflow: dailyInflow, outflow: dailyOutflow } = deltas[scenario]

    // Generate one row per day, upsert via INSERT OR REPLACE
    const generated: string[] = []
    let runningBalance = openingBalance
    const now = new Date()

    for (let d = 0; d < days; d++) {
      const forecastDate = new Date(now)
      forecastDate.setDate(now.getDate() + d)
      const dateStr = forecastDate.toISOString().slice(0, 10)

      const projectedBalance = calcProjectedBalance(runningBalance, dailyInflow, dailyOutflow)
      const warning = isLiquidityWarning(projectedBalance, liquidityThreshold)

      const t  = nowISO()
      const id = newId()

      await exec(
        `INSERT OR REPLACE INTO CashFlowForecast
           (id, storeId, date, projectedInflow, projectedOutflow, projectedBalance,
            actualInflow, actualOutflow, actualBalance, notes, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?)`,
        [
          id, storeId, dateStr,
          dailyInflow, dailyOutflow, projectedBalance,
          warning ? 'LIQUIDITY_WARNING' : '',
          t, t,
        ]
      )

      runningBalance = projectedBalance
      generated.push(dateStr)
    }

    return ok({ generated: generated.length, scenario, days, openingBalance }, 201)
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500)
  }
}
