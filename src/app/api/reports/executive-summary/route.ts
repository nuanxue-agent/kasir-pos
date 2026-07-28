// GET /api/reports/executive-summary?storeId=&period=YYYY-MM
// Generates an on-the-fly executive summary for the given period.
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'
import {
  calcGrossProfit,
  calcGrossMarginPct,
  calcAvgOrderValue,
  calcLTV,
  calcGrowthRate,
  periodBoundaries,
  prevPeriod,
  toPeriodString,
} from '@/lib/executive-summary'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)
  const user = session.user as any

  const sp = req.nextUrl.searchParams
  const storeId = sp.get('storeId') ?? user.stores?.[0]?.id ?? ''
  if (!storeId) return err('storeId required', 400)

  const storeIds: string[] = user.stores?.map((s: any) => s.id) ?? []
  if (!storeIds.includes(storeId)) return err('Store not found', 403)

  // Default period = current month
  const now = new Date()
  const period = sp.get('period') ?? toPeriodString(now)

  const lastMonthPeriod = prevPeriod(period, 1)
  const sameMonthLastYear = prevPeriod(period, 12)

  async function fetchPeriodMetrics(p: string) {
    const { start, end } = periodBoundaries(p)

    const [revenueRows, customerRows, newCustomerRows] = await Promise.all([
      query(
        `SELECT
           COALESCE(SUM(o.total), 0) as revenue,
           COALESCE(SUM(oi.qty * p.cost), 0) as cost,
           COUNT(DISTINCT o.id) as orders
         FROM Orders o
         LEFT JOIN OrderItem oi ON oi.orderId = o.id
         LEFT JOIN Product p ON p.id = oi.productId
         WHERE o.storeId = ? AND o.status = 'completed'
           AND o.createdAt >= ? AND o.createdAt < ?`,
        [storeId, start, end]
      ).catch(() => [{ revenue: 0, cost: 0, orders: 0 }]),

      query(
        `SELECT COUNT(DISTINCT customerId) as totalCustomers
         FROM Orders
         WHERE storeId = ? AND status = 'completed'
           AND createdAt >= ? AND createdAt < ?`,
        [storeId, start, end]
      ).catch(() => [{ totalCustomers: 0 }]),

      query(
        `SELECT COUNT(*) as newCustomers
         FROM Customer
         WHERE storeId = ? AND createdAt >= ? AND createdAt < ?`,
        [storeId, start, end]
      ).catch(() => [{ newCustomers: 0 }]),
    ])

    const r = (revenueRows as any[])[0] ?? {}
    const revenue = Number(r.revenue ?? 0)
    const cost = Number(r.cost ?? 0)
    const orders = Number(r.orders ?? 0)
    const totalCustomers = Number((customerRows as any[])[0]?.totalCustomers ?? 0)
    const newCustomers = Number((newCustomerRows as any[])[0]?.newCustomers ?? 0)

    return {
      period: p,
      revenue,
      cost,
      grossProfit: calcGrossProfit(revenue, cost),
      grossMarginPct: calcGrossMarginPct(revenue, cost),
      orders,
      totalCustomers,
      newCustomers,
      avgOrderValue: calcAvgOrderValue(revenue, orders),
    }
  }

  const [current, lastMonth, yearAgo] = await Promise.all([
    fetchPeriodMetrics(period),
    fetchPeriodMetrics(lastMonthPeriod),
    fetchPeriodMetrics(sameMonthLastYear),
  ])

  // Top 5 products (current period)
  const { start: cStart, end: cEnd } = periodBoundaries(period)
  const topProductsRaw = await query(
    `SELECT
       oi.productId,
       p.name,
       SUM(oi.qty * oi.price) as revenue,
       SUM(oi.qty) as unitsSold
     FROM OrderItem oi
     JOIN Orders o ON oi.orderId = o.id
     LEFT JOIN Product p ON p.id = oi.productId
     WHERE o.storeId = ? AND o.status = 'completed'
       AND o.createdAt >= ? AND o.createdAt < ?
     GROUP BY oi.productId, p.name
     ORDER BY revenue DESC
     LIMIT 5`,
    [storeId, cStart, cEnd]
  ).catch(() => [])

  // Top 5 customers (current period)
  const topCustomersRaw = await query(
    `SELECT
       o.customerId,
       c.name,
       SUM(o.total) as totalSpend,
       COUNT(o.id) as orderCount
     FROM Orders o
     LEFT JOIN Customer c ON c.id = o.customerId
     WHERE o.storeId = ? AND o.status = 'completed'
       AND o.customerId IS NOT NULL
       AND o.createdAt >= ? AND o.createdAt < ?
     GROUP BY o.customerId, c.name
     ORDER BY totalSpend DESC
     LIMIT 5`,
    [storeId, cStart, cEnd]
  ).catch(() => [])

  // LTV (based on current period, 12-month lifespan)
  const ltv = calcLTV(
    current.avgOrderValue,
    current.orders,
    current.totalCustomers,
    12
  )

  const result = {
    period,
    generatedAt: now.toISOString(),
    current,
    lastMonth,
    yearAgo,
    growth: {
      revenueGrowthMoM: calcGrowthRate(current.revenue, lastMonth.revenue),
      revenueGrowthYoY: calcGrowthRate(current.revenue, yearAgo.revenue),
      ordersGrowthMoM: calcGrowthRate(current.orders, lastMonth.orders),
      grossProfitGrowthMoM: calcGrowthRate(current.grossProfit, lastMonth.grossProfit),
    },
    ltv,
    cac: 0, // placeholder — requires marketing spend data
    topProducts: (topProductsRaw as any[]).map(r => ({
      productId: r.productId ?? '',
      name: r.name ?? 'Unknown',
      revenue: Number(r.revenue ?? 0),
      unitsSold: Number(r.unitsSold ?? 0),
    })),
    topCustomers: (topCustomersRaw as any[]).map(r => ({
      customerId: r.customerId ?? '',
      name: r.name ?? 'Guest',
      totalSpend: Number(r.totalSpend ?? 0),
      orderCount: Number(r.orderCount ?? 0),
    })),
  }

  return NextResponse.json(result)
}
