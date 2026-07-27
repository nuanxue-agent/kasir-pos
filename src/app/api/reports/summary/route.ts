import { getRequestContext } from '@cloudflare/next-on-pages'
import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'

export const runtime = 'edge'


// GET /api/reports/summary?storeId=xxx&from=2024-01-01&to=2024-01-31
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const storeId = searchParams.get('storeId')
  const fromParam = searchParams.get('from')
  const toParam = searchParams.get('to')

  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 })

  const from = fromParam ? new Date(fromParam) : new Date(new Date().setDate(1))
  const to = toParam ? new Date(toParam) : new Date()
  to.setHours(23, 59, 59, 999)

  const fromISO = from.toISOString()
  const toISO = to.toISOString()

  const { env } = getRequestContext()
  const db = env.DB

  const [summaryRow, topProducts, dailySales, paymentBreakdown, newCustomersRow] = await Promise.all([
    // Total revenue + counts
    queryOne<{
      totalRevenue: number; totalOrders: number; avgOrderValue: number
      totalTax: number; totalDiscount: number; totalSubtotal: number
    }>(db, `
      SELECT
        COALESCE(SUM(total), 0)       as totalRevenue,
        COUNT(*)                       as totalOrders,
        COALESCE(AVG(total), 0)        as avgOrderValue,
        COALESCE(SUM(taxAmt), 0)       as totalTax,
        COALESCE(SUM(discountAmt), 0)  as totalDiscount,
        COALESCE(SUM(subtotal), 0)     as totalSubtotal
      FROM \`Order\`
      WHERE storeId = ?
        AND status = 'PAID'
        AND createdAt BETWEEN ? AND ?
    `, [storeId, fromISO, toISO]),

    // Top products by revenue
    query<{ name: string; revenue: number; qty: number }>(db, `
      SELECT
        oi.name,
        SUM(oi.subtotal) as revenue,
        SUM(oi.qty)      as qty
      FROM OrderItem oi
      JOIN \`Order\` o ON oi.orderId = o.id
      WHERE o.storeId = ?
        AND o.status = 'PAID'
        AND o.createdAt BETWEEN ? AND ?
      GROUP BY oi.name
      ORDER BY revenue DESC
      LIMIT 5
    `, [storeId, fromISO, toISO]),

    // Daily breakdown
    query<{ date: string; total: number; orders: number }>(db, `
      SELECT
        DATE(createdAt) as date,
        SUM(total)      as total,
        COUNT(*)        as orders
      FROM \`Order\`
      WHERE storeId = ?
        AND status = 'PAID'
        AND createdAt BETWEEN ? AND ?
      GROUP BY DATE(createdAt)
      ORDER BY date ASC
    `, [storeId, fromISO, toISO]),

    // Payment method breakdown
    query<{ method: string; total: number; count: number }>(db, `
      SELECT
        p.method,
        SUM(p.amount) as total,
        COUNT(*)      as count
      FROM Payment p
      JOIN \`Order\` o ON p.orderId = o.id
      WHERE o.storeId = ?
        AND o.status = 'PAID'
        AND o.createdAt BETWEEN ? AND ?
      GROUP BY p.method
    `, [storeId, fromISO, toISO]),

    // New customers
    queryOne<{ newCustomers: number }>(db, `
      SELECT COUNT(*) as newCustomers
      FROM Customer
      WHERE storeId = ?
        AND createdAt BETWEEN ? AND ?
    `, [storeId, fromISO, toISO]),
  ])

  return NextResponse.json({
    summary: {
      totalRevenue:    summaryRow?.totalRevenue    ?? 0,
      totalOrders:     summaryRow?.totalOrders     ?? 0,
      avgOrderValue:   summaryRow?.avgOrderValue   ?? 0,
      totalTax:        summaryRow?.totalTax        ?? 0,
      totalDiscount:   summaryRow?.totalDiscount   ?? 0,
      newCustomers:    newCustomersRow?.newCustomers ?? 0,
    },
    topProducts,
    dailySales,
    paymentBreakdown,
  })
}
