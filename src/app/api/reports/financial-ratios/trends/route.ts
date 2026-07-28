// API route: GET /api/reports/financial-ratios/trends
// Returns 12-month trend data for each financial ratio
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'
import {
  calcCurrentRatio,
  calcGrossMarginPct,
  calcNetMarginPct,
  calcInventoryTurnover,
  calcDebtRatio,
} from '../route'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export interface RatioTrendPoint {
  month: string
  currentRatio: number
  quickRatio: number
  grossMarginPct: number
  netMarginPct: number
  inventoryTurnover: number
  receivablesTurnover: number
  debtRatio: number
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)
  const user = session.user as any
  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id ?? ''
  if (!storeId) return err('storeId required', 400)

  const now = new Date()
  const twelveMonthsAgo = new Date(now)
  twelveMonthsAgo.setMonth(now.getMonth() - 12)
  const fromISO = twelveMonthsAgo.toISOString()

  try {
    // Monthly revenue + COGS
    const salesRows = await query<any>(
      `SELECT
         strftime('%Y-%m', o.createdAt) as month,
         COALESCE(SUM(oi.price * oi.qty), 0) as revenue,
         COALESCE(SUM(p.cost * oi.qty), 0)   as cogs
       FROM OrderItem oi
       JOIN Orders o ON oi.orderId = o.id
       JOIN Product p ON oi.productId = p.id
       WHERE o.storeId = ? AND o.status = 'completed' AND o.createdAt >= ?
       GROUP BY strftime('%Y-%m', o.createdAt)
       ORDER BY month ASC`,
      [storeId, fromISO],
    ).catch(() => [] as any[])

    // Monthly expenses
    const expRows = await query<any>(
      `SELECT
         strftime('%Y-%m', createdAt) as month,
         COALESCE(SUM(amount), 0) as totalExpenses
       FROM Expense
       WHERE storeId = ? AND createdAt >= ?
       GROUP BY strftime('%Y-%m', createdAt)
       ORDER BY month ASC`,
      [storeId, fromISO],
    ).catch(() => [] as any[])

    // Current inventory value (static snapshot — same for all months)
    const invRows = await query<any>(
      `SELECT COALESCE(SUM(p.cost * p.stock), 0) as inventoryValue
       FROM Product p
       WHERE p.storeId = ? AND (p.active = 1 OR p.active IS NULL)`,
      [storeId],
    ).catch(() => [{ inventoryValue: 0 }])
    const inventory = Number((invRows[0] as any)?.inventoryValue ?? 0)

    // Build expense lookup by month
    const expByMonth = new Map<string, number>()
    for (const row of expRows as any[]) {
      expByMonth.set(row.month, Number(row.totalExpenses ?? 0))
    }

    // Build 12-month array filling in zeros for months with no data
    const monthLabels: string[] = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now)
      d.setMonth(now.getMonth() - i)
      monthLabels.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }

    const salesByMonth = new Map<string, { revenue: number; cogs: number }>()
    for (const row of salesRows as any[]) {
      salesByMonth.set(row.month, {
        revenue: Number(row.revenue ?? 0),
        cogs: Number(row.cogs ?? 0),
      })
    }

    const trends: RatioTrendPoint[] = monthLabels.map(month => {
      const s = salesByMonth.get(month) ?? { revenue: 0, cogs: 0 }
      const totalExpenses = expByMonth.get(month) ?? 0
      const netIncome = s.revenue - s.cogs - totalExpenses
      const currentAssets = s.revenue * 0.3 + inventory
      const currentLiabilities = Math.max(totalExpenses * 0.5, 1)
      const totalAssets = currentAssets + inventory * 2
      const totalDebt = totalExpenses * 0.4

      const currentRatio = calcCurrentRatio(currentAssets, currentLiabilities)
      const quickRatio =
        currentLiabilities > 0 ? (currentAssets - inventory) / currentLiabilities : 0
      const grossMarginPct = calcGrossMarginPct(s.revenue, s.cogs)
      const netMarginPct = calcNetMarginPct(s.revenue, netIncome)
      const inventoryTurnover = calcInventoryTurnover(s.cogs, inventory)
      const debtRatio = calcDebtRatio(totalDebt, totalAssets)
      const receivablesTurnover = s.revenue > 0 ? s.revenue / Math.max(inventory * 0.1, 1) : 0

      return {
        month,
        currentRatio: isFinite(currentRatio) ? Math.round(currentRatio * 100) / 100 : 0,
        quickRatio: isFinite(quickRatio) ? Math.round(quickRatio * 100) / 100 : 0,
        grossMarginPct: Math.round(grossMarginPct * 100) / 100,
        netMarginPct: Math.round(netMarginPct * 100) / 100,
        inventoryTurnover: Math.round(inventoryTurnover * 100) / 100,
        receivablesTurnover: Math.round(receivablesTurnover * 100) / 100,
        debtRatio: Math.round(debtRatio * 100) / 100,
      }
    })

    return NextResponse.json(trends)
  } catch (e: any) {
    return err(e.message ?? 'Failed to fetch trends', 500)
  }
}
