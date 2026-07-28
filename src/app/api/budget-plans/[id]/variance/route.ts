// GET /api/budget-plans/[id]/variance
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'
import { ensureTables } from '../../route'
import type { BudgetLine } from '../lines/route'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

export interface VarianceLine {
  id: string
  accountCode: string
  accountName: string
  category: 'REVENUE' | 'EXPENSE'
  // budget
  q1: number; q2: number; q3: number; q4: number; annual: number
  // actual
  actualQ1: number; actualQ2: number; actualQ3: number; actualQ4: number; actualAnnual: number
  // variance (actual - budget; for expense, negative = favorable)
  varQ1: number; varQ2: number; varQ3: number; varQ4: number; varAnnual: number
  // variance %
  varPctQ1: number; varPctQ2: number; varPctQ3: number; varPctQ4: number; varPctAnnual: number
  // achievement %
  achievementPct: number
  favorable: boolean
}

export interface VarianceReport {
  planId: string
  year: number
  name: string
  status: string
  lines: VarianceLine[]
  summary: {
    totalRevenueBudget: number
    totalRevenueActual: number
    totalRevenueVariance: number
    totalExpenseBudget: number
    totalExpenseActual: number
    totalExpenseVariance: number
    netBudget: number
    netActual: number
    netVariance: number
    overallAchievementPct: number
  }
}

function calcVarPct(actual: number, budget: number): number {
  if (budget === 0) return actual !== 0 ? 100 : 0
  return ((actual - budget) / Math.abs(budget)) * 100
}

function isFavorable(category: 'REVENUE' | 'EXPENSE', varAnnual: number): boolean {
  if (category === 'REVENUE') return varAnnual >= 0
  return varAnnual <= 0
}

// GET /api/budget-plans/[id]/variance?storeId=xxx
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id: planId } = await params

    const plans = await query<{ id: string; year: number; name: string; status: string }>(
      `SELECT id, year, name, status FROM BudgetPlan WHERE id = ? AND storeId = ?`,
      [planId, storeId]
    )
    if ((plans as any[]).length === 0) return err('Budget plan not found', 404)
    const plan = (plans as any[])[0]

    const rawLines = await query<BudgetLine>(
      `SELECT * FROM BudgetLine WHERE planId = ? ORDER BY category ASC, accountCode ASC`,
      [planId]
    )

    const lines: VarianceLine[] = (rawLines as any[]).map((l: any) => {
      const varQ1 = l.actualQ1 - l.q1
      const varQ2 = l.actualQ2 - l.q2
      const varQ3 = l.actualQ3 - l.q3
      const varQ4 = l.actualQ4 - l.q4
      const varAnnual = l.actualAnnual - l.annual

      const achievementPct = l.annual === 0
        ? (l.actualAnnual !== 0 ? 100 : 0)
        : (l.actualAnnual / l.annual) * 100

      return {
        id: l.id,
        accountCode: l.accountCode,
        accountName: l.accountName,
        category: l.category,
        q1: l.q1, q2: l.q2, q3: l.q3, q4: l.q4, annual: l.annual,
        actualQ1: l.actualQ1, actualQ2: l.actualQ2, actualQ3: l.actualQ3, actualQ4: l.actualQ4, actualAnnual: l.actualAnnual,
        varQ1, varQ2, varQ3, varQ4, varAnnual,
        varPctQ1: calcVarPct(l.actualQ1, l.q1),
        varPctQ2: calcVarPct(l.actualQ2, l.q2),
        varPctQ3: calcVarPct(l.actualQ3, l.q3),
        varPctQ4: calcVarPct(l.actualQ4, l.q4),
        varPctAnnual: calcVarPct(l.actualAnnual, l.annual),
        achievementPct,
        favorable: isFavorable(l.category, varAnnual),
      }
    })

    const revLines = lines.filter(l => l.category === 'REVENUE')
    const expLines = lines.filter(l => l.category === 'EXPENSE')

    const totalRevenueBudget = revLines.reduce((s, l) => s + l.annual, 0)
    const totalRevenueActual = revLines.reduce((s, l) => s + l.actualAnnual, 0)
    const totalRevenueVariance = totalRevenueActual - totalRevenueBudget

    const totalExpenseBudget = expLines.reduce((s, l) => s + l.annual, 0)
    const totalExpenseActual = expLines.reduce((s, l) => s + l.actualAnnual, 0)
    const totalExpenseVariance = totalExpenseActual - totalExpenseBudget

    const netBudget = totalRevenueBudget - totalExpenseBudget
    const netActual = totalRevenueActual - totalExpenseActual
    const netVariance = netActual - netBudget

    const overallAchievementPct = totalRevenueBudget === 0
      ? 0
      : (totalRevenueActual / totalRevenueBudget) * 100

    const report: VarianceReport = {
      planId,
      year: plan.year,
      name: plan.name,
      status: plan.status,
      lines,
      summary: {
        totalRevenueBudget,
        totalRevenueActual,
        totalRevenueVariance,
        totalExpenseBudget,
        totalExpenseActual,
        totalExpenseVariance,
        netBudget,
        netActual,
        netVariance,
        overallAchievementPct,
      },
    }

    return ok(report)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    return err(msg, 500)
  }
}
