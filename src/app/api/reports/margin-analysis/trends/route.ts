// API route: GET /api/reports/margin-analysis/trends
// Returns 12-month gross margin trend data for a store
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'

function ok(data: unknown) {
  return NextResponse.json(data)
}
function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

interface TrendData {
  month: string
  grossMarginPct: number
  revenue: number
  cost: number
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)

  const user = session.user as any
  const storeIds: string[] = user.stores?.map((s: any) => s.id) ?? []

  const { searchParams } = new URL(req.url)
  const storeId = searchParams.get('storeId') ?? ''

  if (!storeId || !storeIds.includes(storeId)) return err('Store not found', 403)

  try {
    // Calculate date 12 months ago
    const now = new Date()
    const twelveMonthsAgo = new Date(now)
    twelveMonthsAgo.setMonth(now.getMonth() - 12)

    // Fetch monthly aggregates
    const rows = await query<any>(
      `SELECT
         strftime('%Y-%m', o.createdAt) as month,
         SUM(oi.price * oi.qty) as revenue,
         SUM(p.cost * oi.qty) as cost
       FROM OrderItem oi
       JOIN Orders o ON oi.orderId = o.id
       JOIN Product p ON oi.productId = p.id
       WHERE o.storeId = ?
       AND o.status = 'completed'
       AND o.createdAt >= ?
       GROUP BY strftime('%Y-%m', o.createdAt)
       ORDER BY month ASC`,
      [storeId, twelveMonthsAgo.toISOString()]
    )

    const trends: TrendData[] = rows.map((r: any) => {
      const revenue = r.revenue ?? 0
      const cost = r.cost ?? 0
      const grossMarginPct = revenue === 0 ? 0 : ((revenue - cost) / revenue) * 100

      return {
        month: r.month,
        grossMarginPct,
        revenue,
        cost,
      }
    })

    return ok(trends)
  } catch (error: any) {
    console.error('Margin trends error:', error)
    return err(error.message || 'Internal server error', 500)
  }
}
