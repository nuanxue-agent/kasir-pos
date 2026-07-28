import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const stores: { id: string; name: string }[] = user.stores ?? []
    if (stores.length === 0) return ok({ ranking: [] })

    const sp     = req.nextUrl.searchParams
    const metric = sp.get('metric') ?? 'revenue'   // revenue | transactions | growth

    const storeIds     = stores.map((s) => s.id)
    const placeholders = storeIds.map(() => '?').join(',')

    // Current period: last 30 days
    const curRows = await query(
      `SELECT storeId,
              COUNT(*)                AS transactions,
              COALESCE(SUM(total), 0) AS revenue
       FROM   "Order"
       WHERE  storeId IN (${placeholders})
         AND  createdAt >= date('now','-30 days')
         AND  status    = 'COMPLETED'
       GROUP  BY storeId`,
      storeIds,
    ) as any[]

    // Previous period: 30-60 days ago (for growth calc)
    const prevRows = await query(
      `SELECT storeId,
              COALESCE(SUM(total), 0) AS revenue
       FROM   "Order"
       WHERE  storeId IN (${placeholders})
         AND  createdAt >= date('now','-60 days')
         AND  createdAt <  date('now','-30 days')
         AND  status    = 'COMPLETED'
       GROUP  BY storeId`,
      storeIds,
    ) as any[]

    const curMap  = Object.fromEntries(curRows.map((r: any)  => [r.storeId, r]))
    const prevMap = Object.fromEntries(prevRows.map((r: any) => [r.storeId, r]))

    const storeMap = Object.fromEntries(stores.map((s) => [s.id, s.name]))

    const ranked = storeIds.map((id) => {
      const cur  = curMap[id]  ?? { transactions: 0, revenue: 0 }
      const prev = prevMap[id] ?? { revenue: 0 }
      const curRev  = Number(cur.revenue)
      const prevRev = Number(prev.revenue)
      const growth  = prevRev > 0 ? ((curRev - prevRev) / prevRev) * 100 : 0

      return {
        storeId:      id,
        storeName:    storeMap[id] ?? id,
        revenue:      curRev,
        transactions: Number(cur.transactions),
        growth:       Math.round(growth * 100) / 100,
      }
    })

    // Sort by requested metric
    if (metric === 'transactions') {
      ranked.sort((a, b) => b.transactions - a.transactions)
    } else if (metric === 'growth') {
      ranked.sort((a, b) => b.growth - a.growth)
    } else {
      ranked.sort((a, b) => b.revenue - a.revenue)
    }

    const withRank = ranked.map((r, i) => ({ ...r, rank: i + 1 }))
    return ok({ ranking: withRank, metric })
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500)
  }
}
