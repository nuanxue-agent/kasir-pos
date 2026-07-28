// GET /api/cost-centers/variance — cost variance analysis: budget vs actual per cost center
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'
import { ensureCostCenterTables } from '../route'

function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const sp = req.nextUrl.searchParams
    const storeId = sp.get('storeId') ?? user.stores?.[0]?.id
    if (!storeId) return err('storeId required')

    const hasAccess = user.stores?.some((s: { id: string }) => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    await ensureCostCenterTables()

    const period = sp.get('period')

    let sql = `SELECT * FROM CostCenter WHERE storeId = ?`
    const params: any[] = [storeId]
    if (period) { sql += ` AND period = ?`; params.push(period) }
    sql += ` ORDER BY type ASC, name ASC`

    const rows = (await query(sql, params)) as any[]

    const result = rows.map(row => {
      const variance = row.budget - row.actualCost
      const variancePct = row.budget > 0 ? (variance / row.budget) * 100 : 0
      const utilizationPct = row.budget > 0 ? (row.actualCost / row.budget) * 100 : 0
      return {
        ...row,
        variance,
        variancePct: Math.round(variancePct * 100) / 100,
        utilizationPct: Math.round(utilizationPct * 100) / 100,
        status: row.actualCost > row.budget ? 'OVER_BUDGET' : 'ON_BUDGET',
      }
    })

    // Summary totals
    const totalBudget = result.reduce((s, r) => s + r.budget, 0)
    const totalActual = result.reduce((s, r) => s + r.actualCost, 0)
    const totalVariance = totalBudget - totalActual

    return NextResponse.json({
      centers: result,
      summary: {
        totalBudget,
        totalActual,
        totalVariance,
        overallVariancePct: totalBudget > 0
          ? Math.round((totalVariance / totalBudget) * 10000) / 100
          : 0,
        overBudgetCount: result.filter(r => r.status === 'OVER_BUDGET').length,
      },
    })
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500)
  }
}
