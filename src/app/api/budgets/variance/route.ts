// GET /api/budgets/variance — compute variance analysis for a period
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'
import { ensureTables, BudgetCategory } from '../route'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

export interface VarianceRow {
  category: BudgetCategory
  month: number
  budgetAmount: number
  actualAmount: number
  variance: number          // actual - budget
  variancePct: number       // (variance / budget) * 100
  favorable: boolean        // for expense: under budget = favorable; for revenue: over budget = favorable
}

export interface VarianceSummary {
  rows: VarianceRow[]
  totalBudget: number
  totalActual: number
  totalVariance: number
  totalVariancePct: number
}

const REVENUE_CATEGORIES: BudgetCategory[] = ['REVENUE']

function isFavorable(category: BudgetCategory, variance: number): boolean {
  if (REVENUE_CATEGORIES.includes(category)) {
    return variance >= 0  // more revenue = favorable
  }
  return variance <= 0  // less expense = favorable
}

// GET /api/budgets/variance?storeId=xxx&year=2025&monthFrom=1&monthTo=12&category=REVENUE
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

    await ensureTables()

    const year = url.searchParams.get('year')
    if (!year) return err('year required')

    const monthFrom = Number(url.searchParams.get('monthFrom') ?? 1)
    const monthTo = Number(url.searchParams.get('monthTo') ?? 12)
    const category = url.searchParams.get('category')

    let sql = `SELECT * FROM Budget WHERE storeId = ? AND year = ? AND month >= ? AND month <= ?`
    const params: unknown[] = [storeId, Number(year), monthFrom, monthTo]

    if (category) { sql += ` AND category = ?`; params.push(category) }
    sql += ` ORDER BY category ASC, month ASC`

    const rows = await query<{
      id: string
      category: BudgetCategory
      month: number
      budgetAmount: number
      actualAmount: number
    }>(sql, params)

    const varianceRows: VarianceRow[] = rows.map(r => {
      const variance = r.actualAmount - r.budgetAmount
      const variancePct = r.budgetAmount !== 0
        ? (variance / r.budgetAmount) * 100
        : r.actualAmount !== 0 ? 100 : 0
      return {
        category: r.category,
        month: r.month,
        budgetAmount: r.budgetAmount,
        actualAmount: r.actualAmount,
        variance,
        variancePct,
        favorable: isFavorable(r.category, variance),
      }
    })

    const totalBudget = varianceRows.reduce((s, r) => s + r.budgetAmount, 0)
    const totalActual = varianceRows.reduce((s, r) => s + r.actualAmount, 0)
    const totalVariance = totalActual - totalBudget
    const totalVariancePct = totalBudget !== 0 ? (totalVariance / totalBudget) * 100 : 0

    const summary: VarianceSummary = {
      rows: varianceRows,
      totalBudget,
      totalActual,
      totalVariance,
      totalVariancePct,
    }

    return ok(summary)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    return err(msg, 500)
  }
}
