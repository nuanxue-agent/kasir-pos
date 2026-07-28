// API route: GET /api/insights?storeId=
// Returns rule-based AI insights: trends, anomalies, recommendations, opportunities
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, queryOne } from '@/lib/db'

function ok(data: unknown) {
  return NextResponse.json(data)
}
function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export type InsightType = 'TREND' | 'ANOMALY' | 'RECOMMENDATION' | 'OPPORTUNITY'
export type InsightSeverity = 'INFO' | 'WARNING' | 'CRITICAL'

export interface Insight {
  id: string
  type: InsightType
  title: string
  description: string
  severity: InsightSeverity
  actionLabel: string
  actionHref: string
  value?: number
  metadata?: Record<string, unknown>
}

// ── Pure insight generators (exported for unit tests) ─────────────────────────

/** Generate low-stock insights for products below reorder point */
export function generateLowStockInsights(
  products: Array<{ id: string; name: string; stock: number; reorderPoint: number }>,
): Insight[] {
  return products
    .filter(p => p.stock < p.reorderPoint)
    .map(p => {
      const severity: InsightSeverity = p.stock === 0 ? 'CRITICAL' : p.stock <= 3 ? 'WARNING' : 'INFO'
      return {
        id: `low-stock-${p.id}`,
        type: 'RECOMMENDATION' as InsightType,
        title: `Reorder ${p.name}`,
        description: `Only ${p.stock} unit${p.stock !== 1 ? 's' : ''} left (reorder point: ${p.reorderPoint}). Consider restocking soon.`,
        severity,
        actionLabel: 'Go to Inventory',
        actionHref: '/dashboard/inventory',
        value: p.stock,
        metadata: { productId: p.id, stock: p.stock, reorderPoint: p.reorderPoint },
      }
    })
}

/** Calculate revenue trend between this week and last week.
 *  Returns positive percentage = growth, negative = decline. */
export function calcRevenueTrend(thisWeekRevenue: number, lastWeekRevenue: number): number {
  if (lastWeekRevenue === 0) return thisWeekRevenue > 0 ? 100 : 0
  return Math.round(((thisWeekRevenue - lastWeekRevenue) / lastWeekRevenue) * 100)
}

/** Generate revenue trend insight */
export function generateRevenueTrendInsight(
  thisWeekRevenue: number,
  lastWeekRevenue: number,
): Insight | null {
  if (thisWeekRevenue === 0 && lastWeekRevenue === 0) return null
  const pct = calcRevenueTrend(thisWeekRevenue, lastWeekRevenue)
  const growing = pct >= 0
  const absPct = Math.abs(pct)
  const severity: InsightSeverity = growing
    ? absPct >= 20 ? 'INFO' : 'INFO'
    : absPct >= 30 ? 'CRITICAL' : absPct >= 10 ? 'WARNING' : 'INFO'

  return {
    id: 'revenue-trend-week',
    type: 'TREND',
    title: growing
      ? `Revenue up ${absPct}% vs last week`
      : `Revenue down ${absPct}% vs last week`,
    description: growing
      ? `This week's sales are tracking ${absPct}% higher than last week. Keep up the momentum!`
      : `This week's revenue has dropped ${absPct}% compared to last week. Consider running a promotion.`,
    severity,
    actionLabel: 'View Reports',
    actionHref: '/dashboard/reports',
    value: pct,
    metadata: { thisWeek: thisWeekRevenue, lastWeek: lastWeekRevenue, changePercent: pct },
  }
}

/** Find the hour-of-day with the lowest revenue for opportunity insight */
export function findLowestRevenueHour(
  hourlyData: Array<{ hour: number; revenue: number; count: number }>,
): { hour: number; revenue: number; count: number } | null {
  const withRevenue = hourlyData.filter(h => h.hour >= 8 && h.hour <= 22)
  if (!withRevenue.length) return null
  return withRevenue.reduce((min, cur) => (cur.revenue < min.revenue ? cur : min))
}

/** Generate opportunity insight for lowest-traffic hour */
export function generateOpportunityInsight(
  hourlyData: Array<{ hour: number; revenue: number; count: number }>,
): Insight | null {
  const lowest = findLowestRevenueHour(hourlyData)
  if (!lowest) return null
  const hourLabel = lowest.hour === 0 ? '12am' : lowest.hour < 12 ? `${lowest.hour}am` : lowest.hour === 12 ? '12pm' : `${lowest.hour - 12}pm`
  const nextHour = lowest.hour + 1
  const nextLabel = nextHour < 12 ? `${nextHour}am` : nextHour === 12 ? '12pm' : `${nextHour - 12}pm`
  return {
    id: 'opportunity-low-hour',
    type: 'OPPORTUNITY',
    title: `Low traffic at ${hourLabel}–${nextLabel}`,
    description: `${hourLabel}–${nextLabel} has the lowest revenue (${lowest.count} order${lowest.count !== 1 ? 's' : ''}). Consider running a flash promotion during this slot.`,
    severity: 'INFO',
    actionLabel: 'Create Discount',
    actionHref: '/dashboard/discounts',
    value: lowest.hour,
    metadata: { hour: lowest.hour, revenue: lowest.revenue, count: lowest.count },
  }
}

/** Generate churn-risk insight for customers inactive 60+ days */
export function generateChurnRiskInsight(
  churnCount: number,
  totalCustomers: number,
): Insight | null {
  if (churnCount === 0) return null
  const pct = totalCustomers > 0 ? Math.round((churnCount / totalCustomers) * 100) : 0
  const severity: InsightSeverity = pct >= 30 ? 'CRITICAL' : pct >= 10 ? 'WARNING' : 'INFO'
  return {
    id: 'churn-risk',
    type: 'ANOMALY',
    title: `${churnCount} customer${churnCount !== 1 ? 's' : ''} at churn risk`,
    description: `${churnCount} customer${churnCount !== 1 ? 's' : ''} (${pct}% of your base) haven't purchased in 60+ days. Re-engage them with a loyalty offer.`,
    severity,
    actionLabel: 'View Customers',
    actionHref: '/dashboard/crm',
    value: churnCount,
    metadata: { churnCount, totalCustomers, churnPercent: pct },
  }
}

/** Detect expense anomalies: category up >30% vs last month */
export function detectExpenseAnomalies(
  thisMonth: Array<{ category: string; total: number }>,
  lastMonth: Array<{ category: string; total: number }>,
): Insight[] {
  const lastMap = new Map(lastMonth.map(e => [e.category, e.total]))
  return thisMonth
    .filter(e => {
      const prev = lastMap.get(e.category) ?? 0
      if (prev === 0) return false
      return (e.total - prev) / prev > 0.3
    })
    .map(e => {
      const prev = lastMap.get(e.category) ?? 0
      const pct = Math.round(((e.total - prev) / prev) * 100)
      const severity: InsightSeverity = pct >= 60 ? 'CRITICAL' : 'WARNING'
      return {
        id: `expense-anomaly-${e.category.toLowerCase().replace(/\s+/g, '-')}`,
        type: 'ANOMALY' as InsightType,
        title: `${e.category} expenses up ${pct}%`,
        description: `${e.category} spending rose ${pct}% vs last month. Review to ensure this is expected.`,
        severity,
        actionLabel: 'View Expenses',
        actionHref: '/dashboard/expenses',
        value: pct,
        metadata: { category: e.category, thisMonth: e.total, lastMonth: prev, changePercent: pct },
      }
    })
}

/** Classify insight severity based on type and value */
export function classifyInsightSeverity(type: InsightType, value: number): InsightSeverity {
  if (type === 'RECOMMENDATION') {
    if (value === 0) return 'CRITICAL'
    if (value <= 3) return 'WARNING'
    return 'INFO'
  }
  if (type === 'ANOMALY') {
    if (value >= 60) return 'CRITICAL'
    if (value >= 30) return 'WARNING'
    return 'INFO'
  }
  if (type === 'TREND') {
    if (value <= -30) return 'CRITICAL'
    if (value <= -10) return 'WARNING'
    return 'INFO'
  }
  return 'INFO'
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)

  const user = session.user as any
  const storeIds: string[] = user.stores?.map((s: any) => s.id) ?? []

  const { searchParams } = new URL(req.url)
  const storeId = searchParams.get('storeId') ?? ''

  if (!storeId || !storeIds.includes(storeId)) return err('Store not found', 403)

  try {
    const now = new Date()
    const todayStr = now.toISOString().slice(0, 10)

    // Week boundaries
    const thisWeekStart = new Date(now)
    thisWeekStart.setDate(now.getDate() - 7)
    const lastWeekStart = new Date(now)
    lastWeekStart.setDate(now.getDate() - 14)
    const lastWeekEnd = new Date(now)
    lastWeekEnd.setDate(now.getDate() - 7)

    // Month boundaries
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)

    // 60 days ago for churn
    const sixtyDaysAgo = new Date(now)
    sixtyDaysAgo.setDate(now.getDate() - 60)

    // Run all queries in parallel
    const [
      lowStockProducts,
      thisWeekRevRow,
      lastWeekRevRow,
      hourlyData,
      churnRow,
      totalCustomersRow,
      thisMonthExpenses,
      lastMonthExpenses,
    ] = await Promise.all([
      // Low stock: products with stock < reorderPoint
      query<{ id: string; name: string; stock: number; reorderPoint: number }>(
        `SELECT id, name, stock, reorderPoint FROM Product
         WHERE storeId = ? AND stock < reorderPoint
         ORDER BY stock ASC LIMIT 10`,
        [storeId],
      ),

      // This week revenue
      queryOne<{ total: number }>(
        `SELECT COALESCE(SUM(total), 0) as total FROM "Order"
         WHERE storeId = ? AND status = 'PAID' AND createdAt >= ?`,
        [storeId, thisWeekStart.toISOString()],
      ),

      // Last week revenue
      queryOne<{ total: number }>(
        `SELECT COALESCE(SUM(total), 0) as total FROM "Order"
         WHERE storeId = ? AND status = 'PAID'
           AND createdAt >= ? AND createdAt < ?`,
        [storeId, lastWeekStart.toISOString(), lastWeekEnd.toISOString()],
      ),

      // Hourly revenue for last 30 days
      query<{ hour: number; revenue: number; count: number }>(
        `SELECT CAST(strftime('%H', createdAt) AS INTEGER) as hour,
                COALESCE(SUM(total), 0) as revenue,
                COUNT(*) as count
         FROM "Order"
         WHERE storeId = ? AND status = 'PAID'
           AND createdAt >= ?
         GROUP BY hour
         ORDER BY hour`,
        [storeId, new Date(now.getTime() - 30 * 86400000).toISOString()],
      ),

      // Churn risk: customers with no purchase in 60+ days
      queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM Customer
         WHERE storeId = ?
           AND id NOT IN (
             SELECT DISTINCT customerId FROM "Order"
             WHERE storeId = ? AND status = 'PAID'
               AND createdAt >= ?
             AND customerId IS NOT NULL
           )
           AND createdAt < ?`,
        [storeId, storeId, sixtyDaysAgo.toISOString(), sixtyDaysAgo.toISOString()],
      ),

      // Total customers
      queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM Customer WHERE storeId = ?`,
        [storeId],
      ),

      // This month expenses by category
      query<{ category: string; total: number }>(
        `SELECT category, COALESCE(SUM(amount), 0) as total
         FROM Expense
         WHERE storeId = ? AND date >= ?
         GROUP BY category`,
        [storeId, thisMonthStart.toISOString().slice(0, 10)],
      ),

      // Last month expenses by category
      query<{ category: string; total: number }>(
        `SELECT category, COALESCE(SUM(amount), 0) as total
         FROM Expense
         WHERE storeId = ? AND date >= ? AND date <= ?
         GROUP BY category`,
        [storeId, lastMonthStart.toISOString().slice(0, 10), lastMonthEnd.toISOString().slice(0, 10)],
      ),
    ])

    // Build insights
    const insights: Insight[] = []

    // 1. Low stock
    insights.push(...generateLowStockInsights(lowStockProducts))

    // 2. Revenue trend
    const trendInsight = generateRevenueTrendInsight(
      (thisWeekRevRow as any)?.total ?? 0,
      (lastWeekRevRow as any)?.total ?? 0,
    )
    if (trendInsight) insights.push(trendInsight)

    // 3. Opportunity (lowest traffic hour)
    const opportunityInsight = generateOpportunityInsight(hourlyData)
    if (opportunityInsight) insights.push(opportunityInsight)

    // 4. Churn risk
    const churnInsight = generateChurnRiskInsight(
      (churnRow as any)?.count ?? 0,
      (totalCustomersRow as any)?.count ?? 0,
    )
    if (churnInsight) insights.push(churnInsight)

    // 5. Expense anomalies
    insights.push(...detectExpenseAnomalies(thisMonthExpenses, lastMonthExpenses))

    // Sort by severity: CRITICAL first, then WARNING, then INFO
    const severityOrder = { CRITICAL: 0, WARNING: 1, INFO: 2 }
    insights.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])

    return NextResponse.json(insights, {
      headers: { 'Cache-Control': 'private, max-age=60' },
    })
  } catch (e: any) {
    console.error('[insights] error:', e)
    return err(`Failed to generate insights: ${e.message}`, 500)
  }
}
