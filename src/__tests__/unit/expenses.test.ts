import { describe, it, expect } from 'vitest'

// ── Domain types ────────────────────────────────────────────────────────────────

interface ExpenseCategory {
  id: string
  name: string
  budget: number   // monthly budget (0 = no limit)
  color: string
}

interface Expense {
  id: string
  storeId: string
  category: string
  description: string
  amount: number
  date: string        // YYYY-MM-DD
  note?: string | null
  recurring: boolean
}

interface ShiftSummary {
  openingCash: number
  salesCash: number    // cash payments received
  expenses: number     // cash spent on expenses
  closingCash: number  // actual cash counted at close
}

// ── Pure functions under test ───────────────────────────────────────────────────

function validateExpenseAmount(amount: unknown): { valid: boolean; error?: string } {
  const n = Number(amount)
  if (isNaN(n)) return { valid: false, error: 'Amount must be a number' }
  if (n <= 0) return { valid: false, error: 'Amount must be greater than 0' }
  return { valid: true }
}

function calcBudgetStatus(
  category: ExpenseCategory,
  expenses: Expense[],
  month: string   // YYYY-MM
): { spent: number; remaining: number; overBudget: boolean; pct: number } {
  const spent = expenses
    .filter(e => e.category === category.name && e.date.startsWith(month))
    .reduce((s, e) => s + e.amount, 0)
  const remaining = Math.max(0, category.budget - spent)
  const overBudget = category.budget > 0 && spent > category.budget
  const pct = category.budget > 0 ? Math.min(100, (spent / category.budget) * 100) : 0
  return { spent, remaining, overBudget, pct }
}

function assignCategory(expense: Omit<Expense, 'id'>, categories: ExpenseCategory[]): string {
  const match = categories.find(c => c.name.toLowerCase() === expense.category.toLowerCase())
  return match ? match.name : expense.category
}

function generateRecurringExpenses(
  template: Expense,
  targetMonth: string   // YYYY-MM
): Expense[] {
  if (!template.recurring) return []
  // Generate one instance for targetMonth on the same day-of-month
  const [, , day] = template.date.split('-')
  const newDate = `${targetMonth}-${day}`
  return [{
    ...template,
    id: `${template.id}-${targetMonth}`,
    date: newDate,
  }]
}

function calcExpectedClosingCash(summary: Omit<ShiftSummary, 'closingCash'>): number {
  return summary.openingCash + summary.salesCash - summary.expenses
}

function calcCashVariance(summary: ShiftSummary): number {
  const expected = calcExpectedClosingCash(summary)
  return summary.closingCash - expected
}

function isBalanced(summary: ShiftSummary, tolerance = 1000): boolean {
  return Math.abs(calcCashVariance(summary)) <= tolerance
}

// ── Tests ───────────────────────────────────────────────────────────────────────

describe('Expense amount validation', () => {
  it('rejects zero', () => {
    const { valid, error } = validateExpenseAmount(0)
    expect(valid).toBe(false)
    expect(error).toContain('greater than 0')
  })

  it('rejects negative amounts', () => {
    expect(validateExpenseAmount(-500).valid).toBe(false)
  })

  it('rejects non-numeric input', () => {
    const r = validateExpenseAmount('abc')
    expect(r.valid).toBe(false)
    expect(r.error).toContain('number')
  })

  it('accepts positive integer', () => {
    expect(validateExpenseAmount(50_000).valid).toBe(true)
  })

  it('accepts positive decimal', () => {
    expect(validateExpenseAmount(12_500.5).valid).toBe(true)
  })
})

describe('Budget vs actual calculation', () => {
  const catOps: ExpenseCategory = { id: 'c1', name: 'Operasional', budget: 1_000_000, color: '#f59e0b' }
  const expenses: Expense[] = [
    { id: 'e1', storeId: 's1', category: 'Operasional', description: 'Listrik', amount: 300_000, date: '2026-07-05', recurring: false },
    { id: 'e2', storeId: 's1', category: 'Operasional', description: 'Internet', amount: 200_000, date: '2026-07-10', recurring: false },
    { id: 'e3', storeId: 's1', category: 'Gaji', description: 'Staff', amount: 2_000_000, date: '2026-07-01', recurring: true },
  ]

  it('calculates spent correctly for the month', () => {
    const { spent } = calcBudgetStatus(catOps, expenses, '2026-07')
    expect(spent).toBe(500_000)
  })

  it('calculates remaining budget', () => {
    const { remaining } = calcBudgetStatus(catOps, expenses, '2026-07')
    expect(remaining).toBe(500_000)
  })

  it('flags over-budget when exceeded', () => {
    const bigCat: ExpenseCategory = { ...catOps, budget: 100_000 }
    const { overBudget } = calcBudgetStatus(bigCat, expenses, '2026-07')
    expect(overBudget).toBe(true)
  })

  it('returns 0% progress when budget is 0 (unlimited)', () => {
    const unlimitedCat: ExpenseCategory = { ...catOps, budget: 0 }
    const { pct, overBudget } = calcBudgetStatus(unlimitedCat, expenses, '2026-07')
    expect(pct).toBe(0)
    expect(overBudget).toBe(false)
  })
})

describe('Category assignment', () => {
  const categories: ExpenseCategory[] = [
    { id: 'c1', name: 'Operasional', budget: 0, color: '#f59e0b' },
    { id: 'c2', name: 'Gaji', budget: 5_000_000, color: '#3b82f6' },
  ]

  it('matches category by name (exact)', () => {
    const exp = { storeId: 's1', category: 'Gaji', description: 'Staff', amount: 1000, date: '2026-07-01', recurring: false }
    expect(assignCategory(exp, categories)).toBe('Gaji')
  })

  it('matches category case-insensitively', () => {
    const exp = { storeId: 's1', category: 'operasional', description: 'Listrik', amount: 1000, date: '2026-07-01', recurring: false }
    expect(assignCategory(exp, categories)).toBe('Operasional')
  })

  it('returns original category name when no match', () => {
    const exp = { storeId: 's1', category: 'Transportasi', description: 'Bensin', amount: 1000, date: '2026-07-01', recurring: false }
    expect(assignCategory(exp, categories)).toBe('Transportasi')
  })
})

describe('Recurring expense generation', () => {
  const template: Expense = {
    id: 'e1',
    storeId: 's1',
    category: 'Sewa',
    description: 'Sewa gedung',
    amount: 5_000_000,
    date: '2026-07-01',
    recurring: true,
  }

  it('generates one expense for the target month', () => {
    const result = generateRecurringExpenses(template, '2026-08')
    expect(result).toHaveLength(1)
    expect(result[0].date).toBe('2026-08-01')
  })

  it('carries over same amount and category', () => {
    const result = generateRecurringExpenses(template, '2026-08')
    expect(result[0].amount).toBe(5_000_000)
    expect(result[0].category).toBe('Sewa')
  })

  it('returns empty array for non-recurring expense', () => {
    const nonRecurring: Expense = { ...template, recurring: false }
    expect(generateRecurringExpenses(nonRecurring, '2026-08')).toHaveLength(0)
  })
})

describe('Cash flow reconciliation', () => {
  it('calculates expected closing cash correctly', () => {
    const expected = calcExpectedClosingCash({ openingCash: 500_000, salesCash: 2_000_000, expenses: 300_000 })
    expect(expected).toBe(2_200_000)
  })

  it('returns positive variance when actual exceeds expected', () => {
    const summary: ShiftSummary = { openingCash: 500_000, salesCash: 2_000_000, expenses: 300_000, closingCash: 2_300_000 }
    expect(calcCashVariance(summary)).toBe(100_000)
  })

  it('returns negative variance when actual is less than expected', () => {
    const summary: ShiftSummary = { openingCash: 500_000, salesCash: 2_000_000, expenses: 300_000, closingCash: 2_100_000 }
    expect(calcCashVariance(summary)).toBe(-100_000)
  })

  it('considers shift balanced within tolerance', () => {
    const summary: ShiftSummary = { openingCash: 500_000, salesCash: 2_000_000, expenses: 300_000, closingCash: 2_200_500 }
    expect(isBalanced(summary, 1000)).toBe(true)
  })

  it('flags imbalance when variance exceeds tolerance', () => {
    const summary: ShiftSummary = { openingCash: 500_000, salesCash: 2_000_000, expenses: 300_000, closingCash: 1_000_000 }
    expect(isBalanced(summary, 1000)).toBe(false)
  })
})
