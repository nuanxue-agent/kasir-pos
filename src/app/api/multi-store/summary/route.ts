import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec } from '@/lib/db'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

async function ensureStoreTargetTable(): Promise<void> {
  await exec(`
    CREATE TABLE IF NOT EXISTS StoreTarget (
      id           TEXT PRIMARY KEY,
      storeId      TEXT NOT NULL,
      metric       TEXT NOT NULL CHECK(metric IN ('REVENUE','TRANSACTIONS','NEW_CUSTOMERS')),
      targetValue  REAL NOT NULL,
      period       TEXT NOT NULL,
      actualValue  REAL NOT NULL DEFAULT 0,
      createdAt    TEXT NOT NULL,
      updatedAt    TEXT NOT NULL
    )
  `)
}

export async function GET(_req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const stores: { id: string; name: string }[] = user.stores ?? []
    if (stores.length === 0) return ok({ stores: [], total: 0 })

    await ensureStoreTargetTable()

    const storeIds = stores.map((s) => s.id)
    const placeholders = storeIds.map(() => '?').join(',')

    // Revenue & transaction summary per store (last 30 days)
    const revRows = await query(
      `SELECT storeId,
              COUNT(*)           AS transactions,
              COALESCE(SUM(total), 0) AS revenue,
              COALESCE(AVG(total), 0) AS avgOrder
       FROM   "Order"
       WHERE  storeId IN (${placeholders})
         AND  createdAt >= date('now','-30 days')
         AND  status    = 'COMPLETED'
       GROUP  BY storeId`,
      storeIds,
    ) as any[]

    // Top product per store
    const topRows = await query(
      `SELECT oi.storeId, oi.productName, SUM(oi.quantity) AS qty
       FROM   OrderItem oi
       JOIN   "Order"    o  ON o.id = oi.orderId
       WHERE  oi.storeId IN (${placeholders})
         AND  o.createdAt >= date('now','-30 days')
         AND  o.status    = 'COMPLETED'
       GROUP  BY oi.storeId, oi.productName
       ORDER  BY oi.storeId, qty DESC`,
      storeIds,
    ) as any[]

    // Low-stock alerts per store
    const stockRows = await query(
      `SELECT storeId, COUNT(*) AS shortage
       FROM   Product
       WHERE  storeId IN (${placeholders})
         AND  stock <= reorderPoint
         AND  isActive = 1
       GROUP  BY storeId`,
      storeIds,
    ) as any[]

    // New customers per store (last 30 days)
    const custRows = await query(
      `SELECT storeId, COUNT(*) AS newCustomers
       FROM   Customer
       WHERE  storeId IN (${placeholders})
         AND  createdAt >= date('now','-30 days')
       GROUP  BY storeId`,
      storeIds,
    ) as any[]

    const revMap    = Object.fromEntries(revRows.map((r: any) => [r.storeId, r]))
    const stockMap  = Object.fromEntries(stockRows.map((r: any) => [r.storeId, r.shortage]))
    const custMap   = Object.fromEntries(custRows.map((r: any) => [r.storeId, r.newCustomers]))

    // Top product map: storeId -> first row for that store
    const topMap: Record<string, string> = {}
    for (const row of topRows) {
      if (!topMap[row.storeId]) topMap[row.storeId] = row.productName
    }

    const result = stores.map((s) => {
      const rev = revMap[s.id] ?? { transactions: 0, revenue: 0, avgOrder: 0 }
      return {
        storeId:      s.id,
        storeName:    s.name,
        revenue:      Number(rev.revenue),
        transactions: Number(rev.transactions),
        avgOrder:     Number(rev.avgOrder),
        topProduct:   topMap[s.id] ?? null,
        stockShortage: Number(stockMap[s.id] ?? 0),
        newCustomers:  Number(custMap[s.id] ?? 0),
      }
    })

    return ok({ stores: result, total: result.length })
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500)
  }
}
