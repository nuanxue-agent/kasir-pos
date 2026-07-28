import { describe, it, expect } from 'vitest'

// ── Types ──────────────────────────────────────────────────────────────────────

type BudgetPlanStatus = 'DRAFT' | 'APPROVED' | 'LOCKED'
type BudgetLineCategory = 'REVENUE' | 'EXPENSE'

interface BudgetLine {
  id: string
  planId: string
  storeId: string
  accountCode: string
  accountName: string
  category: BudgetLineCategory
  q1: number; q2: number; q3: number; q4: number; annual: number
  actualQ1: number; actualQ2: number; actualQ3: number; actualQ4: number; actualAnnual: number
}

interface BudgetPlan {
  id: string
  storeId: string
  year: number
  name: string
  status: BudgetPlanStatus
  totalRevenueBudget: number
  totalExpenseBudget: number
  approvedBy: string | null
  approvedAt: string | null
}

// ── Pure helpers (mirror API/component logic) ──────────────────────────────────

function calcAnnualTotal(q1: number, q2: number, q3: number, q4: number): number {
  return q1 + q2 + q3 + q4
}

function calcQuarterlyVariance(actual: number, budget: number): number {
  return actual - budget
}

function calcVariancePct(actual: number, budget: number): number {
  if (budget === 0) return actual !== 0 ? 100 : 0
  return ((actual - budget) / Math.abs(budget)) * 100
}

function calcAchievementPct(actualAnnual: number, annual: number): number {
  if (annual === 0) return actualAnnual !== 0 ? 100 : 0
  return (actualAnnual / annual) * 100
}

function isOverBudget(category: BudgetLineCategory, varAnnual: number): boolean {
  if (category === 'REVENUE') return varAnnual < 0   // under target = over budget concern
  return varAnnual > 0                                // expense over budget
}

function isFavorable(category: BudgetLineCategory, varAnnual: number): boolean {
  if (category === 'REVENUE') return varAnnual >= 0
  return varAnnual <= 0
}

function calcPlanTotals(lines: BudgetLine[]): { totalRevenueBudget: number; totalExpenseBudget: number } {
  const totalRevenueBudget = lines
    .filter(l => l.category === 'REVENUE')
    .reduce((s, l) => s + l.annual, 0)
  const totalExpenseBudget = lines
    .filter(l => l.category === 'EXPENSE')
    .reduce((s, l) => s + l.annual, 0)
  return { totalRevenueBudget, totalExpenseBudget }
}

function calcNetBudget(totalRevenueBudget: number, totalExpenseBudget: number): number {
  return totalRevenueBudget - totalExpenseBudget
}

function calcNetActual(totalRevenueActual: number, totalExpenseActual: number): number {
  return totalRevenueActual - totalExpenseActual
}

function canTransition(current: BudgetPlanStatus, next: BudgetPlanStatus): boolean {
  if (current === 'LOCKED') return false
  if (current === 'DRAFT' && next === 'APPROVED') return true
  if (current === 'APPROVED' && next === 'LOCKED') return true
  return false
}

// ── Fixtures ───────────────────────────────────────────────────────────────────

function makeLine(overrides: Partial<BudgetLine> = {}): BudgetLine {
  return {
    id: 'line-1',
    planId: 'plan-1',
    storeId: 'store-1',
    accountCode: '4-001',
    accountName: 'Pendapatan Penjualan',
    category: 'REVENUE',
    q1: 50_000_000, q2: 55_000_000, q3: 60_000_000, q4: 65_000_000,
    annual: 230_000_000,
    actualQ1: 48_000_000, actualQ2: 57_000_000, actualQ3: 59_000_000, actualQ4: 66_000_000,
    actualAnnual: 230_000_000,
    ...overrides,
  }
}

function makeExpenseLine(overrides: Partial<BudgetLine> = {}): BudgetLine {
  return makeLine({
    id: 'line-2',
    accountCode: '5-001',
    accountName: 'Beban Gaji',
    category: 'EXPENSE',
    q1: 20_000_000, q2: 20_000_000, q3: 20_000_000, q4: 20_000_000,
    annual: 80_000_000,
    actualQ1: 21_000_000, actualQ2: 19_500_000, actualQ3: 20_500_000, actualQ4: 20_000_000,
    actualAnnual: 81_000_000,
    ...overrides,
  })
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('Annual budget total calculation', () => {
  it('sums four quarters correctly', () => {
    expect(calcAnnualTotal(50_000_000, 55_000_000, 60_000_000, 65_000_000)).toBe(230_000_000)
  })

  it('returns 0 when all quarters are zero', () => {
    expect(calcAnnualTotal(0, 0, 0, 0)).toBe(0)
  })

  it('handles unequal quarters', () => {
    expect(calcAnnualTotal(10_000_000, 20_000_000, 30_000_000, 40_000_000)).toBe(100_000_000)
  })
})

describe('Quarterly variance calculation', () => {
  it('returns positive variance when actual exceeds budget', () => {
    expect(calcQuarterlyVariance(57_000_000, 55_000_000)).toBe(2_000_000)
  })

  it('returns negative variance when actual is below budget', () => {
    expect(calcQuarterlyVariance(48_000_000, 50_000_000)).toBe(-2_000_000)
  })

  it('returns zero when actual equals budget', () => {
    expect(calcQuarterlyVariance(60_000_000, 60_000_000)).toBe(0)
  })

  it('calculates variance percentage correctly', () => {
    expect(calcVariancePct(57_000_000, 55_000_000)).toBeCloseTo(3.636, 2)
  })

  it('returns 100 when budget is zero and actual is positive', () => {
    expect(calcVariancePct(5_000_000, 0)).toBe(100)
  })
})

describe('Budget achievement percentage', () => {
  it('calculates correct achievement when actual meets budget', () => {
    expect(calcAchievementPct(230_000_000, 230_000_000)).toBe(100)
  })

  it('calculates partial achievement', () => {
    expect(calcAchievementPct(115_000_000, 230_000_000)).toBe(50)
  })

  it('returns 100 when budget is zero and actual is positive', () => {
    expect(calcAchievementPct(5_000_000, 0)).toBe(100)
  })
})

describe('Over/under budget detection', () => {
  it('revenue under target is over budget concern', () => {
    expect(isOverBudget('REVENUE', -5_000_000)).toBe(true)
  })

  it('revenue above target is not over budget concern', () => {
    expect(isOverBudget('REVENUE', 5_000_000)).toBe(false)
  })

  it('expense above budget is over budget', () => {
    expect(isOverBudget('EXPENSE', 1_000_000)).toBe(true)
  })

  it('expense below budget is not over budget', () => {
    expect(isOverBudget('EXPENSE', -500_000)).toBe(false)
  })
})

describe('Revenue vs expense balance', () => {
  it('calculates plan totals from lines', () => {
    const lines = [
      makeLine({ annual: 230_000_000 }),
      makeExpenseLine({ annual: 80_000_000 }),
    ]
    const totals = calcPlanTotals(lines)
    expect(totals.totalRevenueBudget).toBe(230_000_000)
    expect(totals.totalExpenseBudget).toBe(80_000_000)
  })

  it('net budget is revenue minus expense', () => {
    expect(calcNetBudget(230_000_000, 80_000_000)).toBe(150_000_000)
  })

  it('net actual is revenue actual minus expense actual', () => {
    expect(calcNetActual(230_000_000, 81_000_000)).toBe(149_000_000)
  })

  it('favorable for revenue means actual >= budget', () => {
    expect(isFavorable('REVENUE', 0)).toBe(true)
    expect(isFavorable('REVENUE', 1_000_000)).toBe(true)
    expect(isFavorable('REVENUE', -1_000_000)).toBe(false)
  })

  it('budget plan status transitions follow DRAFT -> APPROVED -> LOCKED', () => {
    expect(canTransition('DRAFT', 'APPROVED')).toBe(true)
    expect(canTransition('APPROVED', 'LOCKED')).toBe(true)
    expect(canTransition('LOCKED', 'APPROVED')).toBe(false)
    expect(canTransition('LOCKED', 'DRAFT')).toBe(false)
  })
})
