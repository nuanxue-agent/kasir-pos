// GET /api/branches/comparison
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'
import { ensureBranchTable } from '../route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export function sortBranchesByMetric(
  branches: BranchMetric[],
  metric: 'revenue' | 'orders' | 'avgTicket',
  dir: 'asc' | 'desc' = 'desc'
): BranchMetric[] {
  return [...branches].sort((a, b) => {
    const diff = a[metric] - b[metric]
    return dir === 'desc' ? -diff : diff
  })
}

export function calcConsolidatedRevenue(branches: BranchMetric[]): number {
  return branches.reduce((sum, b) => sum + b.revenue, 0)
}

export function calcConsolidatedOrders(branches: BranchMetric[]): number {
  return branches.reduce((sum, b) => sum + b.orders, 0)
}

export function calcNetworkAvgTicket(branches: BranchMetric[]): number {
  const totalRevenue = calcConsolidatedRevenue(branches)
  const totalOrders = calcConsolidatedOrders(branches)
  return totalOrders === 0 ? 0 : totalRevenue / totalOrders
}

export interface BranchMetric {
  branchId: string
  name: string
  active: boolean
  revenue: number
  orders: number
  avgTicket: number
  revenueShare: number // % of network total
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  const range = req.nextUrl.searchParams.get('range') ?? '30'
  const days = parseInt(range, 10) || 30
  const sortBy = (req.nextUrl.searchParams.get('sortBy') ?? 'revenue') as
    | 'revenue'
    | 'orders'
    | 'avgTicket'

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  const cutoffISO = cutoff.toISOString()

  await ensureBranchTable()

  const branchRows = await query(
    `SELECT id, name, active FROM Branch WHERE parentStoreId = ? ORDER BY name ASC`,
    [storeId]
  )

  const metrics: BranchMetric[] = await Promise.all(
    (branchRows as any[]).map(async branch => {
      const rows = await query(
        `SELECT
           COALESCE(SUM(total), 0) as revenue,
           COUNT(*) as orders
         FROM Orders
         WHERE branchId = ? AND status = 'completed' AND createdAt >= ?`,
        [branch.id, cutoffISO]
      ).catch(() => [{ revenue: 0, orders: 0 }])

      const r = rows[0] as any
      const revenue = Number(r?.revenue ?? 0)
      const orders = Number(r?.orders ?? 0)
      return {
        branchId: branch.id,
        name: branch.name,
        active: Boolean(branch.active),
        revenue,
        orders,
        avgTicket: orders === 0 ? 0 : revenue / orders,
        revenueShare: 0, // filled below
      }
    })
  )

  const totalRevenue = calcConsolidatedRevenue(metrics)

  // Fill revenue share percentages
  metrics.forEach(m => {
    m.revenueShare = totalRevenue === 0 ? 0 : (m.revenue / totalRevenue) * 100
  })

  const sorted = sortBranchesByMetric(metrics, sortBy)

  return NextResponse.json({
    storeId,
    range: days,
    sortBy,
    consolidated: {
      revenue: totalRevenue,
      orders: calcConsolidatedOrders(metrics),
      avgTicket: calcNetworkAvgTicket(metrics),
      branchCount: metrics.length,
      activeBranches: metrics.filter(m => m.active).length,
    },
    branches: sorted,
  })
}
