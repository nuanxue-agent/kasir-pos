// GET /api/pl-statement — computed P&L for a period
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'
import { ensureTables, PLAccount, PLCategory } from '../pl-accounts/route'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

export interface PLAccountLine {
  accountId: string
  code: string
  name: string
  category: PLCategory
  parentId: string | null
  actual: number
  budget: number
  priorYear: number
}

export interface PLSection {
  category: PLCategory
  label: string
  accounts: PLAccountLine[]
  total: number
  budgetTotal: number
  priorYearTotal: number
}

export interface PLStatementResult {
  period: string
  budgetPeriod: string
  priorYearPeriod: string
  revenue: PLSection
  cogs: PLSection
  grossProfit: number
  grossProfitBudget: number
  grossProfitPriorYear: number
  grossMarginPct: number
  opex: PLSection
  ebitda: number
  ebitdaBudget: number
  ebitdaPriorYear: number
  otherIncome: PLSection
  otherExpense: PLSection
  netProfit: number
  netProfitBudget: number
  netProfitPriorYear: number
  netMarginPct: number
}

const CATEGORY_LABELS: Record<PLCategory, string> = {
  REVENUE: 'Pendapatan',
  COGS: 'Harga Pokok Penjualan',
  OPEX: 'Beban Operasional',
  OTHER_INCOME: 'Pendapatan Lainnya',
  OTHER_EXPENSE: 'Beban Lainnya',
}

function priorYearPeriod(period: string): string {
  // period: YYYY-MM → subtract 1 year
  const [y, m] = period.split('-')
  return `${Number(y) - 1}-${m}`
}

function sumEntries(
  entries: { accountId: string; amount: number }[],
  accountIds: Set<string>
): number {
  return entries
    .filter(e => accountIds.has(e.accountId))
    .reduce((s, e) => s + e.amount, 0)
}

function buildSection(
  category: PLCategory,
  accounts: PLAccount[],
  actualEntries: { accountId: string; amount: number }[],
  budgetEntries: { accountId: string; amount: number }[],
  priorEntries: { accountId: string; amount: number }[]
): PLSection {
  const catAccounts = accounts.filter(a => a.category === category && a.active === 1)

  const lines: PLAccountLine[] = catAccounts.map(a => ({
    accountId: a.id,
    code: a.code,
    name: a.name,
    category: a.category,
    parentId: a.parentId,
    actual: actualEntries.filter(e => e.accountId === a.id).reduce((s, e) => s + e.amount, 0),
    budget: budgetEntries.filter(e => e.accountId === a.id).reduce((s, e) => s + e.amount, 0),
    priorYear: priorEntries.filter(e => e.accountId === a.id).reduce((s, e) => s + e.amount, 0),
  }))

  const total = lines.reduce((s, l) => s + l.actual, 0)
  const budgetTotal = lines.reduce((s, l) => s + l.budget, 0)
  const priorYearTotal = lines.reduce((s, l) => s + l.priorYear, 0)

  return { category, label: CATEGORY_LABELS[category], accounts: lines, total, budgetTotal, priorYearTotal }
}

// GET /api/pl-statement?storeId=xxx&period=2025-01
// Optional: budgetPeriod=2025-01 (defaults to same period)
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

    const period = url.searchParams.get('period')
    if (!period) return err('period required (YYYY-MM)')
    if (!/^\d{4}-\d{2}$/.test(period)) return err('period must be YYYY-MM')

    await ensureTables()

    const budgetPeriod = url.searchParams.get('budgetPeriod') ?? period
    const pyPeriod = priorYearPeriod(period)

    // Load all accounts for this store
    const accounts = await query<PLAccount>(
      `SELECT * FROM PLAccount WHERE storeId = ? ORDER BY category ASC, code ASC`,
      [storeId]
    )

    // Load entries for current period, budget period, prior year
    const [actualEntries, budgetEntries, priorEntries] = await Promise.all([
      query<{ accountId: string; amount: number }>(
        `SELECT accountId, amount FROM PLEntry WHERE storeId = ? AND period = ?`,
        [storeId, period]
      ),
      query<{ accountId: string; amount: number }>(
        `SELECT accountId, amount FROM PLEntry WHERE storeId = ? AND period = ?`,
        [storeId, budgetPeriod]
      ),
      query<{ accountId: string; amount: number }>(
        `SELECT accountId, amount FROM PLEntry WHERE storeId = ? AND period = ?`,
        [storeId, pyPeriod]
      ),
    ])

    const accs = accounts as PLAccount[]
    const actuals = actualEntries as { accountId: string; amount: number }[]
    const budgets = budgetEntries as { accountId: string; amount: number }[]
    const priors = priorEntries as { accountId: string; amount: number }[]

    const revenue = buildSection('REVENUE', accs, actuals, budgets, priors)
    const cogs = buildSection('COGS', accs, actuals, budgets, priors)
    const opex = buildSection('OPEX', accs, actuals, budgets, priors)
    const otherIncome = buildSection('OTHER_INCOME', accs, actuals, budgets, priors)
    const otherExpense = buildSection('OTHER_EXPENSE', accs, actuals, budgets, priors)

    const grossProfit = revenue.total - cogs.total
    const grossProfitBudget = revenue.budgetTotal - cogs.budgetTotal
    const grossProfitPriorYear = revenue.priorYearTotal - cogs.priorYearTotal
    const grossMarginPct = revenue.total !== 0 ? (grossProfit / revenue.total) * 100 : 0

    const ebitda = grossProfit - opex.total
    const ebitdaBudget = grossProfitBudget - opex.budgetTotal
    const ebitdaPriorYear = grossProfitPriorYear - opex.priorYearTotal

    const netProfit = ebitda + otherIncome.total - otherExpense.total
    const netProfitBudget = ebitdaBudget + otherIncome.budgetTotal - otherExpense.budgetTotal
    const netProfitPriorYear = ebitdaPriorYear + otherIncome.priorYearTotal - otherExpense.priorYearTotal
    const netMarginPct = revenue.total !== 0 ? (netProfit / revenue.total) * 100 : 0

    const result: PLStatementResult = {
      period,
      budgetPeriod,
      priorYearPeriod: pyPeriod,
      revenue,
      cogs,
      grossProfit,
      grossProfitBudget,
      grossProfitPriorYear,
      grossMarginPct,
      opex,
      ebitda,
      ebitdaBudget,
      ebitdaPriorYear,
      otherIncome,
      otherExpense,
      netProfit,
      netProfitBudget,
      netProfitPriorYear,
      netMarginPct,
    }

    return ok(result)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    return err(msg, 500)
  }
}
