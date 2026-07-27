import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, queryOne } from '@/lib/db'

function ok(data: any, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const url = new URL(req.url)
    const storeId: string = url.searchParams.get('storeId') ?? user.stores?.[0]?.id
    if (!storeId) return err('storeId required', 400)

    // Verify user has access to this store
    const hasAccess = user.stores?.some((s: any) => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    // Today and yesterday date boundaries (UTC)
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
    const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString()
    const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toISOString()

    // Run queries in parallel
    const [
      todayRevenueRow,
      yesterdayRevenueRow,
      todayCountRow,
      yesterdayCountRow,
      lowStockRow,
      topProductRow,
      activeShift,
    ] = await Promise.all([
      // Today's revenue
      queryOne<any>(
        `SELECT COALESCE(SUM(total), 0) as revenue FROM "Order"
         WHERE storeId=? AND status='COMPLETED' AND createdAt >= ? AND createdAt < ?`,
        [storeId, todayStart, tomorrowStart]
      ),
      // Yesterday's revenue
      queryOne<any>(
        `SELECT COALESCE(SUM(total), 0) as revenue FROM "Order"
         WHERE storeId=? AND status='COMPLETED' AND createdAt >= ? AND createdAt < ?`,
        [storeId, yesterdayStart, todayStart]
      ),
      // Today's order count
      queryOne<any>(
        `SELECT COUNT(*) as count FROM "Order"
         WHERE storeId=? AND status='COMPLETED' AND createdAt >= ? AND createdAt < ?`,
        [storeId, todayStart, tomorrowStart]
      ),
      // Yesterday's order count
      queryOne<any>(
        `SELECT COUNT(*) as count FROM "Order"
         WHERE storeId=? AND status='COMPLETED' AND createdAt >= ? AND createdAt < ?`,
        [storeId, yesterdayStart, todayStart]
      ),
      // Low stock count
      queryOne<any>(
        `SELECT COUNT(*) as count FROM Product
         WHERE storeId=? AND trackStock=1 AND active=1 AND stock <= lowStock`,
        [storeId]
      ),
      // Top product today by quantity sold
      queryOne<any>(
        `SELECT p.id, p.name, COALESCE(SUM(oi.qty), 0) as totalQty, COALESCE(SUM(oi.total), 0) as totalRevenue
         FROM OrderItem oi
         JOIN "Order" o ON oi.orderId = o.id
         JOIN Product p ON oi.productId = p.id
         WHERE o.storeId=? AND o.status='COMPLETED' AND o.createdAt >= ? AND o.createdAt < ?
         GROUP BY p.id, p.name
         ORDER BY totalQty DESC
         LIMIT 1`,
        [storeId, todayStart, tomorrowStart]
      ),
      // Active shift (not yet closed)
      queryOne<any>(
        `SELECT * FROM Shift WHERE storeId=? AND closedAt IS NULL ORDER BY openedAt DESC LIMIT 1`,
        [storeId]
      ),
    ])

    return ok({
      todayRevenue: todayRevenueRow?.revenue ?? 0,
      yesterdayRevenue: yesterdayRevenueRow?.revenue ?? 0,
      todayOrderCount: todayCountRow?.count ?? 0,
      yesterdayOrderCount: yesterdayCountRow?.count ?? 0,
      lowStockCount: lowStockRow?.count ?? 0,
      topProductToday: topProductRow ?? null,
      activeShift: activeShift ?? null,
    })
  } catch (e: any) {
    console.error('Dashboard summary error:', e)
    return err('Internal server error', 500)
  }
}
