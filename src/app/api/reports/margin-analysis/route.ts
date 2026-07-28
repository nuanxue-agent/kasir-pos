// API route: GET /api/reports/margin-analysis
// Returns per-product profit margin analysis for a store
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'

function ok(data: unknown) {
  return NextResponse.json(data)
}
function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

interface ProductMargin {
  productId: string
  productName: string
  category: string
  revenue: number
  cost: number
  grossMargin: number
  grossMarginPct: number
  unitsSold: number
  avgPrice: number
  avgCost: number
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
    // Fetch order items with product details
    const rows = await query<any>(
      `SELECT
         oi.productId,
         p.name as productName,
         p.category,
         SUM(oi.qty) as unitsSold,
         SUM(oi.price * oi.qty) as revenue,
         SUM(p.cost * oi.qty) as cost,
         AVG(oi.price) as avgPrice,
         AVG(p.cost) as avgCost
       FROM OrderItem oi
       JOIN Orders o ON oi.orderId = o.id
       JOIN Product p ON oi.productId = p.id
       WHERE o.storeId = ?
       AND o.status = 'completed'
       GROUP BY oi.productId, p.name, p.category
       ORDER BY revenue DESC`,
      [storeId]
    )

    const margins: ProductMargin[] = rows.map((r: any) => {
      const revenue = r.revenue ?? 0
      const cost = r.cost ?? 0
      const grossMargin = revenue - cost
      const grossMarginPct = revenue === 0 ? 0 : (grossMargin / revenue) * 100

      return {
        productId: r.productId,
        productName: r.productName ?? 'Unknown',
        category: r.category ?? 'Uncategorized',
        revenue,
        cost,
        grossMargin,
        grossMarginPct,
        unitsSold: r.unitsSold ?? 0,
        avgPrice: r.avgPrice ?? 0,
        avgCost: r.avgCost ?? 0,
      }
    })

    return ok(margins)
  } catch (error: any) {
    console.error('Margin analysis error:', error)
    return err(error.message || 'Internal server error', 500)
  }
}
