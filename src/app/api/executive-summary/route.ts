import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const storeId = searchParams.get('storeId')
    if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 })

    const now = new Date()
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999).toISOString()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()

    // Revenue this month vs last month
    const revenueRows = await query(
      `SELECT
        SUM(CASE WHEN createdAt >= ? THEN total ELSE 0 END) as thisPeriod,
        SUM(CASE WHEN createdAt >= ? AND createdAt <= ? THEN total ELSE 0 END) as lastPeriod
       FROM "Order"
       WHERE storeId = ? AND status = 'PAID'`,
      [thisMonthStart, lastMonthStart, lastMonthEnd, storeId],
    ).catch(() => [{ thisPeriod: 0, lastPeriod: 0 }])
    const rev = (revenueRows as any[])[0] ?? {}
    const thisRevenue: number = rev.thisPeriod ?? 0
    const lastRevenue: number = rev.lastPeriod ?? 0
    const revenueGrowth =
      lastRevenue > 0 ? ((thisRevenue - lastRevenue) / lastRevenue) * 100 : 0

    // COGS approximation for profit margin (sum cost * qty from order items this month)
    const cogsRows = await query(
      `SELECT COALESCE(SUM(oi.unitCost * oi.quantity), 0) as totalCogs
       FROM OrderItem oi
       JOIN "Order" o ON o.id = oi.orderId
       WHERE o.storeId = ? AND o.status = 'PAID' AND o.createdAt >= ?`,
      [storeId, thisMonthStart],
    ).catch(() => [{ totalCogs: 0 }])
    const totalCogs: number = ((cogsRows as any[])[0]?.totalCogs) ?? 0
    const profitMargin = thisRevenue > 0 ? ((thisRevenue - totalCogs) / thisRevenue) * 100 : 0

    // Customer count (active last 30 days)
    const custRows = await query(
      `SELECT COUNT(DISTINCT customerId) as cnt FROM "Order"
       WHERE storeId = ? AND customerId IS NOT NULL AND createdAt >= ?`,
      [storeId, thirtyDaysAgo],
    ).catch(() => [{ cnt: 0 }])
    const customerCount: number = ((custRows as any[])[0]?.cnt) ?? 0

    // Total customers
    const totalCustRows = await query(
      `SELECT COUNT(*) as cnt FROM Customer WHERE storeId = ?`,
      [storeId],
    ).catch(() => [{ cnt: 0 }])
    const totalCustomers: number = ((totalCustRows as any[])[0]?.cnt) ?? 0

    // Inventory value (current stock * cost)
    const invRows = await query(
      `SELECT COALESCE(SUM(p.cost * COALESCE(i.quantity, 0)), 0) as inventoryValue
       FROM Product p
       LEFT JOIN Inventory i ON i.productId = p.id AND i.storeId = ?
       WHERE p.storeId = ? AND p.active = 1`,
      [storeId, storeId],
    ).catch(() => [{ inventoryValue: 0 }])
    const inventoryValue: number = ((invRows as any[])[0]?.inventoryValue) ?? 0

    // Outstanding AR (invoices not fully paid — sales orders)
    const arRows = await query(
      `SELECT COALESCE(SUM(amount - amountPaid), 0) as outstanding
       FROM SalesInvoice
       WHERE storeId = ? AND status IN ('SENT','PARTIAL','OVERDUE')`,
      [storeId],
    ).catch(() => [{ outstanding: 0 }])
    const outstandingAR: number = ((arRows as any[])[0]?.outstanding) ?? 0

    // Outstanding AP (purchase invoices not fully paid)
    const apRows = await query(
      `SELECT COALESCE(SUM(amount - amountPaid), 0) as outstanding
       FROM PurchaseInvoice
       WHERE storeId = ? AND status IN ('RECEIVED','PARTIAL','OVERDUE')`,
      [storeId],
    ).catch(() => [{ outstanding: 0 }])
    const outstandingAP: number = ((apRows as any[])[0]?.outstanding) ?? 0

    // Top 5 products by revenue this month
    const topProductsRows = await query(
      `SELECT p.id, p.name, SUM(oi.quantity * oi.unitPrice) as revenue, SUM(oi.quantity) as unitsSold
       FROM OrderItem oi
       JOIN Product p ON p.id = oi.productId
       JOIN "Order" o ON o.id = oi.orderId
       WHERE o.storeId = ? AND o.status = 'PAID' AND o.createdAt >= ?
       GROUP BY p.id, p.name
       ORDER BY revenue DESC
       LIMIT 5`,
      [storeId, thisMonthStart],
    ).catch(() => [])
    const topProducts = (topProductsRows as any[]).map((r: any) => ({
      id: r.id,
      name: r.name,
      revenue: r.revenue ?? 0,
      unitsSold: r.unitsSold ?? 0,
    }))

    // Top 5 customers by revenue this month
    const topCustomersRows = await query(
      `SELECT c.id, c.name, SUM(o.total) as revenue, COUNT(o.id) as orderCount
       FROM "Order" o
       JOIN Customer c ON c.id = o.customerId
       WHERE o.storeId = ? AND o.status = 'PAID' AND o.createdAt >= ?
       GROUP BY c.id, c.name
       ORDER BY revenue DESC
       LIMIT 5`,
      [storeId, thisMonthStart],
    ).catch(() => [])
    const topCustomers = (topCustomersRows as any[]).map((r: any) => ({
      id: r.id,
      name: r.name,
      revenue: r.revenue ?? 0,
      orderCount: r.orderCount ?? 0,
    }))

    // Top 5 staff by sales this month
    const topStaffRows = await query(
      `SELECT e.id, e.name, SUM(o.total) as revenue, COUNT(o.id) as orderCount
       FROM "Order" o
       JOIN Employee e ON e.id = o.cashierId
       WHERE o.storeId = ? AND o.status = 'PAID' AND o.createdAt >= ?
       GROUP BY e.id, e.name
       ORDER BY revenue DESC
       LIMIT 5`,
      [storeId, thisMonthStart],
    ).catch(() => [])
    const topStaff = (topStaffRows as any[]).map((r: any) => ({
      id: r.id,
      name: r.name,
      revenue: r.revenue ?? 0,
      orderCount: r.orderCount ?? 0,
    }))

    return NextResponse.json({
      kpis: {
        revenue: thisRevenue,
        revenueGrowth,
        profitMargin,
        customerCount,
        totalCustomers,
        inventoryValue,
        outstandingAR,
        outstandingAP,
      },
      rankings: {
        topProducts,
        topCustomers,
        topStaff,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
