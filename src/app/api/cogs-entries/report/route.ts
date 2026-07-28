import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec } from '@/lib/db'
import { ensureValuationTables } from '@/app/api/inventory-valuation/route'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

// GET /api/cogs-entries/report?storeId=&from=&to=&groupBy=month|product
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const url = new URL(req.url)
    const storeId = url.searchParams.get('storeId')
    if (!storeId) return err('storeId required')

    const hasAccess = user.stores?.some((s: { id: string }) => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    await ensureValuationTables()

    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    const groupBy = url.searchParams.get('groupBy') ?? 'month'

    const params: unknown[] = [storeId]
    let whereClause = `WHERE ce.storeId = ?`
    if (from) { whereClause += ` AND ce.soldAt >= ?`; params.push(from) }
    if (to) { whereClause += ` AND ce.soldAt <= ?`; params.push(to) }

    let rows: any[]

    if (groupBy === 'product') {
      rows = await query(
        `SELECT
           ce.productId,
           COALESCE(p.name, ce.productId) AS productName,
           SUM(ce.qty) AS totalQty,
           SUM(ce.totalCost) AS totalCost,
           COUNT(*) AS entryCount,
           AVG(ce.costPrice) AS avgCostPrice
         FROM COGSEntry ce
         LEFT JOIN Product p ON p.id = ce.productId
         ${whereClause}
         GROUP BY ce.productId
         ORDER BY totalCost DESC`,
        params
      ) as any[]
    } else {
      // group by month (YYYY-MM)
      rows = await query(
        `SELECT
           SUBSTR(ce.soldAt, 1, 7) AS period,
           SUM(ce.qty) AS totalQty,
           SUM(ce.totalCost) AS totalCost,
           COUNT(*) AS entryCount,
           AVG(ce.costPrice) AS avgCostPrice
         FROM COGSEntry ce
         ${whereClause}
         GROUP BY SUBSTR(ce.soldAt, 1, 7)
         ORDER BY period DESC`,
        params
      ) as any[]
    }

    const grandTotal = rows.reduce((s: number, r: any) => s + (r.totalCost ?? 0), 0)
    return ok({ rows, grandTotal, groupBy, from, to })
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
