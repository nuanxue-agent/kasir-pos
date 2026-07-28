// GET /api/branches/[id]/performance
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'
import { ensureBranchTable } from '../../route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export function calcAvgTicket(revenue: number, orders: number): number {
  if (orders === 0) return 0
  return revenue / orders
}

export function calcRevenueGrowth(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0
  return ((current - previous) / previous) * 100
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')

  const { id: branchId } = await params
  await ensureBranchTable()

  const range = req.nextUrl.searchParams.get('range') ?? '30'
  const days = parseInt(range, 10) || 30

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  const cutoffISO = cutoff.toISOString()

  const prevCutoff = new Date(cutoff)
  prevCutoff.setDate(prevCutoff.getDate() - days)
  const prevCutoffISO = prevCutoff.toISOString()

  // Revenue & order counts for current period
  const [currentRows, previousRows, dailyRows] = await Promise.all([
    query(
      `SELECT
         COALESCE(SUM(total), 0) as revenue,
         COUNT(*) as orders
       FROM Orders
       WHERE branchId = ? AND status = 'completed' AND createdAt >= ?`,
      [branchId, cutoffISO]
    ).catch(() => [{ revenue: 0, orders: 0 }]),

    query(
      `SELECT
         COALESCE(SUM(total), 0) as revenue,
         COUNT(*) as orders
       FROM Orders
       WHERE branchId = ? AND status = 'completed' AND createdAt >= ? AND createdAt < ?`,
      [branchId, prevCutoffISO, cutoffISO]
    ).catch(() => [{ revenue: 0, orders: 0 }]),

    query(
      `SELECT
         strftime('%Y-%m-%d', createdAt) as date,
         COALESCE(SUM(total), 0) as revenue,
         COUNT(*) as orders
       FROM Orders
       WHERE branchId = ? AND status = 'completed' AND createdAt >= ?
       GROUP BY strftime('%Y-%m-%d', createdAt)
       ORDER BY date ASC`,
      [branchId, cutoffISO]
    ).catch(() => []),
  ])

  const current = currentRows[0] as any
  const previous = previousRows[0] as any

  const revenue = Number(current?.revenue ?? 0)
  const orders = Number(current?.orders ?? 0)
  const prevRevenue = Number(previous?.revenue ?? 0)
  const prevOrders = Number(previous?.orders ?? 0)

  return NextResponse.json({
    branchId,
    range: days,
    revenue,
    orders,
    avgTicket: calcAvgTicket(revenue, orders),
    revenueGrowth: calcRevenueGrowth(revenue, prevRevenue),
    ordersGrowth: calcRevenueGrowth(orders, prevOrders),
    previousRevenue: prevRevenue,
    previousOrders: prevOrders,
    daily: (dailyRows as any[]).map(r => ({
      date: r.date,
      revenue: Number(r.revenue),
      orders: Number(r.orders),
    })),
  })
}
