import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'


// GET /api/reports/summary?storeId=xxx&from=2024-01-01&to=2024-01-31
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const storeId = searchParams.get('storeId')
  const from = searchParams.get('from') ? new Date(searchParams.get('from')!) : new Date(new Date().setDate(1))
  const to = searchParams.get('to') ? new Date(searchParams.get('to')!) : new Date()

  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 })

  // Set to end of day
  to.setHours(23, 59, 59, 999)

  const where = {
    storeId,
    status: 'PAID' as const,
    createdAt: { gte: from, lte: to },
  }

  const [orders, topProducts, dailySales, newCustomers] = await Promise.all([
    // Summary stats
    prisma.order.aggregate({
      where,
      _sum: { total: true, subtotal: true, taxAmt: true, discountAmt: true },
      _count: { id: true },
      _avg: { total: true },
    }),

    // Top products by revenue
    prisma.orderItem.groupBy({
      by: ['productId', 'name'],
      where: { order: { storeId, status: 'PAID', createdAt: { gte: from, lte: to } } },
      _sum: { subtotal: true, qty: true },
      orderBy: { _sum: { subtotal: 'desc' } },
      take: 10,
    }),

    // Daily sales for chart
    prisma.$queryRaw<Array<{ date: string; total: number; orders: number }>>`
      SELECT
        DATE(created_at) as date,
        SUM(total) as total,
        COUNT(*) as orders
      FROM "Order"
      WHERE store_id = ${storeId}
        AND status = 'PAID'
        AND created_at >= ${from}
        AND created_at <= ${to}
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `,

    // New customers
    prisma.customer.count({
      where: { storeId, createdAt: { gte: from, lte: to } },
    }),
  ])

  // Payment method breakdown
  const paymentBreakdown = await prisma.payment.groupBy({
    by: ['method'],
    where: { order: { storeId, status: 'PAID', createdAt: { gte: from, lte: to } } },
    _sum: { amount: true },
    _count: { id: true },
  })

  return NextResponse.json({
    summary: {
      totalRevenue: orders._sum.total ?? 0,
      totalOrders: orders._count.id,
      avgOrderValue: orders._avg.total ?? 0,
      totalTax: orders._sum.taxAmt ?? 0,
      totalDiscount: orders._sum.discountAmt ?? 0,
      newCustomers,
    },
    topProducts,
    dailySales,
    paymentBreakdown,
  })
}
