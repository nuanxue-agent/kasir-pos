import { describe, it, expect } from 'vitest'

// ── Types ─────────────────────────────────────────────────────────────────────

type BudgetCategory =
  | 'REVENUE'
  | 'COGS'
  | 'OPERATING_EXPENSE'
  | 'MARKETING'
  | 'SALARY'
  | 'RENT'
  | 'UTILITIES'
  | 'OTHER_EXPENSE'

interface BudgetRow {
  id: string
  storeId: string
  year: number
  category: BudgetCategory
  month: number
  budgetAmount: number
  actualAmount: number
  notes: string
}

// ── Pure business-logic functions (mirrors API/component logic) ───────────────

const REVENUE_CATEGORIES: BudgetCategory[] = ['REVENUE']

function calcVariance(actualAmount: number, budgetAmount: number): number {
  return actualAmount - budgetAmount
}

function calcVariancePct(actualAmount: number, budgetAmount: number): number {
  if (budgetAmount === 0) return actualAmount !== 0 ? 100 : 0
  return ((actualAmount - budgetAmount) / budgetAmount) * 100
}

function isFavorable(category: BudgetCategory, variance: number): boolean {
  if (REVENUE_CATEGORIES.includes(category)) return variance >= 0
  return variance <= 0
}

function calcMonthlyTotal(rows: BudgetRow[], year: number, month: number): number {
  return rows
    .filter(r => r.year === year && r.month === month)
    .reduce((s, r) => s + r.budgetAmount, 0)
}

function calcYTD(rows: BudgetRow[], year: number, throughMonth: number): {
  totalBudget: number
  totalActual: number
  variance: number
} {
  const filtered = rows.filter(r => r.year === year && r.month >= 1 && r.month <= throughMonth)
  const totalBudget = filtered.reduce((s, r) => s + r.budgetAmount, 0)
  const totalActual = filtered.reduce((s, r) => s + r.actualAmount, 0)
  return { totalBudget, totalActual, variance: totalActual - totalBudget }
}

function copyBudgetRows(
  sourceRows: BudgetRow[],
  fromYear: number,
  toYear: number,
  existingRows: BudgetRow[]
): BudgetRow[] {
  const existingKeys = new Set(
    existingRows
      .filter(r => r.year === toYear)
      .map(r => `${r.category}-${r.month}`)
  )
  return sourceRows
    .filter(r => r.year === fromYear)
    .filter(r => !existingKeys.has(`${r.category}-${r.month}`))
    .map(r => ({
      ...r,
      id: `copy-${r.id}`,
      year: toYear,
      actualAmount: 0,
    }))
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeRow(overrides: Partial<BudgetRow> = {}): BudgetRow {
  return {
    id: 'bgt-1',
    storeId: 'store-1',
    year: 2025,
    category: 'REVENUE',
    month: 1,
    budgetAmount: 10_000_000,
    actualAmount: 0,
    notes: '',
    ...overrides,
  }
}

function makeMonthlyRows(): BudgetRow[] {
  return Array.from({ length: 12 }, (_, i) => makeRow({
    id: `bgt-${i + 1}`,
    month: i + 1,
    budgetAmount: 10_000_000,
    actualAmount: 9_000_000 + i * 100_000,
  }))
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Variance calculation — absolute', () => {
  it('returns positive variance when actual exceeds budget', () => {
    expect(calcVariance(12_000_000, 10_000_000)).toBe(2_000_000)
  })

  it('returns negative variance when actual is below budget', () => {
    expect(calcVariance(8_000_000, 10_000_000)).toBe(-2_000_000)
  })

  it('returns zero variance when actual equals budget', () => {
    expect(calcVariance(10_000_000, 10_000_000)).toBe(0)
  })
})

describe('Variance calculation — percentage', () => {
  it('calculates correct positive percentage', () => {
    expect(calcVariancePct(12_000_000, 10_000_000)).toBeCloseTo(20, 5)
  })

  it('calculates correct negative percentage', () => {
    expect(calcVariancePct(8_000_000, 10_000_000)).toBeCloseTo(-20, 5)
  })

  it('returns 0 when both budget and actual are zero', () => {
    expect(calcVariancePct(0, 0)).toBe(0)
  })

  it('returns 100 when budget is zero but actual is positive', () => {
    expect(calcVariancePct(5_000_000, 0)).toBe(100)
  })
})

describe('Favorable vs unfavorable classification', () => {
  it('revenue over budget is favorable', () => {
    expect(isFavorable('REVENUE', 1_000_000)).toBe(true)
  })

  it('revenue under budget is unfavorable', () => {
    expect(isFavorable('REVENUE', -500_000)).toBe(false)
  })

  it('expense under budget is favorable', () => {
    expect(isFavorable('SALARY', -200_000)).toBe(true)
  })

  it('expense over budget is unfavorable', () => {
    expect(isFavorable('OPERATING_EXPENSE', 300_000)).toBe(false)
  })

  it('zero variance is favorable for both revenue and expense', () => {
    expect(isFavorable('REVENUE', 0)).toBe(true)
    expect(isFavorable('COGS', 0)).toBe(true)
  })
})

describe('Monthly budget total', () => {
  it('sums all categories for a given month', () => {
    const rows: BudgetRow[] = [
      makeRow({ category: 'REVENUE', month: 3, budgetAmount: 10_000_000 }),
      makeRow({ id: 'b2', category: 'SALARY', month: 3, budgetAmount: 3_000_000 }),
      makeRow({ id: 'b3', category: 'RENT', month: 3, budgetAmount: 2_000_000 }),
      makeRow({ id: 'b4', category: 'REVENUE', month: 4, budgetAmount: 8_000_000 }), // different month
    ]
    expect(calcMonthlyTotal(rows, 2025, 3)).toBe(15_000_000)
  })

  it('returns 0 for a month with no rows', () => {
    const rows = makeMonthlyRows()
    expect(calcMonthlyTotal(rows, 2025, 13)).toBe(0) // out of range
  })
})

describe('Year-to-date aggregation', () => {
  it('aggregates budget and actual through specified month', () => {
    const rows = makeMonthlyRows() // months 1–12, budget 10M each
    const ytd = calcYTD(rows, 2025, 6)
    expect(ytd.totalBudget).toBe(60_000_000)   // 6 * 10M
  })

  it('calculates correct YTD variance', () => {
    const rows = makeMonthlyRows()
    const ytd = calcYTD(rows, 2025, 3)
    // actual: 9_000_000 + 9_100_000 + 9_200_000 = 27_300_000
    // budget: 30_000_000
    expect(ytd.variance).toBe(ytd.totalActual - ytd.totalBudget)
    expect(ytd.totalActual).toBe(27_300_000)
  })

  it('excludes rows from other years', () => {
    const rows = [
      ...makeMonthlyRows(),
      makeRow({ id: 'other-year', year: 2024, month: 1, budgetAmount: 99_000_000 }),
    ]
    const ytd = calcYTD(rows, 2025, 12)
    expect(ytd.totalBudget).toBe(120_000_000) // only 2025 rows
  })
})

describe('Budget copy logic', () => {
  it('copies all rows from source year to target year', () => {
    const source = makeMonthlyRows() // 12 rows for 2025
    const copied = copyBudgetRows(source, 2025, 2026, [])
    expect(copied.length).toBe(12)
    expect(copied.every(r => r.year === 2026)).toBe(true)
  })

  it('resets actualAmount to 0 in copied rows', () => {
    const source = [makeRow({ actualAmount: 5_000_000 })]
    const copied = copyBudgetRows(source, 2025, 2026, [])
    expect(copied[0].actualAmount).toBe(0)
  })

  it('skips rows that already exist in target year', () => {
    const source = makeMonthlyRows()
    const existing = [makeRow({ year: 2026, month: 1 }), makeRow({ id: 'e2', year: 2026, month: 2 })]
    const copied = copyBudgetRows(source, 2025, 2026, existing)
    expect(copied.length).toBe(10) // 12 - 2 skipped
  })

  it('preserves budgetAmount from source year', () => {
    const source = [makeRow({ budgetAmount: 7_500_000 })]
    const copied = copyBudgetRows(source, 2025, 2026, [])
    expect(copied[0].budgetAmount).toBe(7_500_000)
  })
})
