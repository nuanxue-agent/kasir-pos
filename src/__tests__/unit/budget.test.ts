import { describe, it, expect } from 'vitest'
import {
  calcVariance,
  calcUtilization,
  isOverBudget,
  calcMonthlyAverage,
  projectCashFlow,
  utilizationColor,
  utilizationTextColor,
} from '@/components/reports/BudgetPlannerClient'

// ── Budget variance ───────────────────────────────────────────────────────────

describe('calcVariance', () => {
  it('returns positive variance when over budget', () => {
    expect(calcVariance(1_000_000, 1_200_000)).toBe(200_000)
  })

  it('returns negative variance when under budget', () => {
    expect(calcVariance(1_000_000, 800_000)).toBe(-200_000)
  })

  it('returns zero when exactly on budget', () => {
    expect(calcVariance(500_000, 500_000)).toBe(0)
  })
})

// ── Utilization percentage ────────────────────────────────────────────────────

describe('calcUtilization', () => {
  it('returns 100 when actual equals budget', () => {
    expect(calcUtilization(1_000_000, 1_000_000)).toBe(100)
  })

  it('returns 50 when actual is half the budget', () => {
    expect(calcUtilization(1_000_000, 500_000)).toBe(50)
  })

  it('returns value > 100 when over budget', () => {
    expect(calcUtilization(1_000_000, 1_500_000)).toBe(150)
  })

  it('returns 0 when budget is 0 and actual is 0', () => {
    expect(calcUtilization(0, 0)).toBe(0)
  })

  it('returns 100 when budget is 0 and actual > 0', () => {
    expect(calcUtilization(0, 500_000)).toBe(100)
  })
})

// ── Over-budget detection ─────────────────────────────────────────────────────

describe('isOverBudget', () => {
  it('returns true when actual exceeds budget', () => {
    expect(isOverBudget(1_000_000, 1_000_001)).toBe(true)
  })

  it('returns false when actual is exactly at budget', () => {
    expect(isOverBudget(1_000_000, 1_000_000)).toBe(false)
  })

  it('returns false when actual is under budget', () => {
    expect(isOverBudget(1_000_000, 999_999)).toBe(false)
  })
})

// ── 3-month average calculation ───────────────────────────────────────────────

describe('calcMonthlyAverage', () => {
  it('returns average of last 3 values in a longer series', () => {
    // Only uses last 3: [40, 50, 60] → avg = 50
    const avg = calcMonthlyAverage([10, 20, 30, 40, 50, 60])
    expect(avg).toBeCloseTo(50)
  })

  it('returns correct average of exactly 3 values', () => {
    expect(calcMonthlyAverage([100_000, 200_000, 300_000])).toBeCloseTo(200_000)
  })

  it('returns 0 for empty array', () => {
    expect(calcMonthlyAverage([])).toBe(0)
  })

  it('returns the single value for a one-element array', () => {
    expect(calcMonthlyAverage([500_000])).toBe(500_000)
  })
})

// ── Cash flow projection ──────────────────────────────────────────────────────

describe('projectCashFlow', () => {
  it('returns the requested number of months', () => {
    const proj = projectCashFlow(10_000_000, 6_000_000, 3)
    expect(proj).toHaveLength(3)
  })

  it('net equals income minus expenses for each month', () => {
    const proj = projectCashFlow(10_000_000, 6_000_000, 3)
    for (const p of proj) {
      expect(p.projectedNet).toBeCloseTo(p.projectedIncome - p.projectedExpenses)
    }
  })

  it('clamps negative projected income/expenses to 0', () => {
    const proj = projectCashFlow(-5_000_000, -3_000_000, 1)
    expect(proj[0].projectedIncome).toBe(0)
    expect(proj[0].projectedExpenses).toBe(0)
  })

  it('net can be negative when expenses exceed income', () => {
    const proj = projectCashFlow(3_000_000, 5_000_000, 1)
    expect(proj[0].projectedNet).toBeCloseTo(-2_000_000)
  })
})

// ── Utilization color helpers ─────────────────────────────────────────────────

describe('utilizationColor', () => {
  it('returns green class below 80%', () => {
    expect(utilizationColor(79)).toBe('bg-green-500')
  })

  it('returns amber class between 80% and 100%', () => {
    expect(utilizationColor(90)).toBe('bg-amber-500')
    expect(utilizationColor(100)).toBe('bg-amber-500')
  })

  it('returns red class above 100%', () => {
    expect(utilizationColor(101)).toBe('bg-red-500')
  })
})

describe('utilizationTextColor', () => {
  it('returns green text class below 80%', () => {
    expect(utilizationTextColor(50)).toBe('text-green-600')
  })

  it('returns amber text class at 80–100%', () => {
    expect(utilizationTextColor(95)).toBe('text-amber-600')
  })

  it('returns red text class above 100%', () => {
    expect(utilizationTextColor(120)).toBe('text-red-600')
  })
})
