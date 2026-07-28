import { describe, it, expect } from 'vitest'
import {
  calcBudgetUtilization,
  calcBudgetVariance,
  classifyTrafficLight,
  shouldAlert,
  parsePeriod,
  formatPeriod,
  prevPeriod,
  aggregateByCategory,
  trafficLightBg,
  trafficLightText,
  type TrafficLight,
} from '@/components/reports/BudgetClient'

// ── Budget utilization percentage ─────────────────────────────────────────────

describe('calcBudgetUtilization', () => {
  it('returns 100 when actual equals budget', () => {
    expect(calcBudgetUtilization(1_000_000, 1_000_000)).toBe(100)
  })

  it('returns 50 when actual is half the budget', () => {
    expect(calcBudgetUtilization(1_000_000, 500_000)).toBe(50)
  })

  it('returns > 100 when over budget', () => {
    expect(calcBudgetUtilization(1_000_000, 1_500_000)).toBe(150)
  })

  it('returns 0 when budget is 0 and actual is 0', () => {
    expect(calcBudgetUtilization(0, 0)).toBe(0)
  })

  it('returns 100 when budget is 0 but actual > 0', () => {
    expect(calcBudgetUtilization(0, 500_000)).toBe(100)
  })
})

// ── Variance calculation ──────────────────────────────────────────────────────

describe('calcBudgetVariance', () => {
  it('returns positive when over budget', () => {
    expect(calcBudgetVariance(1_000_000, 1_200_000)).toBe(200_000)
  })

  it('returns negative when under budget', () => {
    expect(calcBudgetVariance(1_000_000, 800_000)).toBe(-200_000)
  })

  it('returns zero when exactly on budget', () => {
    expect(calcBudgetVariance(500_000, 500_000)).toBe(0)
  })
})

// ── Traffic light classification ──────────────────────────────────────────────

describe('classifyTrafficLight', () => {
  it('returns green when utilization < 80%', () => {
    expect(classifyTrafficLight(79)).toBe('green')
    expect(classifyTrafficLight(0)).toBe('green')
  })

  it('returns amber when utilization is 80–100%', () => {
    expect(classifyTrafficLight(80)).toBe('amber')
    expect(classifyTrafficLight(100)).toBe('amber')
  })

  it('returns red when utilization > 100%', () => {
    expect(classifyTrafficLight(101)).toBe('red')
    expect(classifyTrafficLight(200)).toBe('red')
  })
})

// ── Alert threshold detection ─────────────────────────────────────────────────

describe('shouldAlert', () => {
  it('fires 80% alert when utilization >= 80', () => {
    expect(shouldAlert(80, 80)).toBe(true)
    expect(shouldAlert(95, 80)).toBe(true)
    expect(shouldAlert(110, 80)).toBe(true)
  })

  it('does not fire 80% alert when utilization < 80', () => {
    expect(shouldAlert(79, 80)).toBe(false)
  })

  it('fires 100% alert when utilization >= 100', () => {
    expect(shouldAlert(100, 100)).toBe(true)
    expect(shouldAlert(120, 100)).toBe(true)
  })

  it('does not fire 100% alert when utilization < 100', () => {
    expect(shouldAlert(99, 100)).toBe(false)
  })
})

// ── Period date helpers ───────────────────────────────────────────────────────

describe('parsePeriod', () => {
  it('parses YYYY-MM string into year and month', () => {
    expect(parsePeriod('2025-03')).toEqual({ year: 2025, month: 3 })
    expect(parsePeriod('2024-12')).toEqual({ year: 2024, month: 12 })
  })
})

describe('formatPeriod', () => {
  it('formats a Date as YYYY-MM string', () => {
    expect(formatPeriod(new Date(2025, 0, 15))).toBe('2025-01') // January
    expect(formatPeriod(new Date(2024, 11, 1))).toBe('2024-12') // December
  })
})

describe('prevPeriod', () => {
  it('returns previous month in YYYY-MM format', () => {
    expect(prevPeriod('2025-03')).toBe('2025-02')
    expect(prevPeriod('2025-01')).toBe('2024-12') // year rollover
  })
})

// ── Category aggregation ──────────────────────────────────────────────────────

describe('aggregateByCategory', () => {
  it('sums amounts by category', () => {
    const rows = [
      { category: 'COGS', amount: 100_000 },
      { category: 'COGS', amount: 200_000 },
      { category: 'RENT', amount: 500_000 },
    ]
    const result = aggregateByCategory(rows)
    expect(result['COGS']).toBe(300_000)
    expect(result['RENT']).toBe(500_000)
  })

  it('returns empty object for empty input', () => {
    expect(aggregateByCategory([])).toEqual({})
  })

  it('handles single-entry categories', () => {
    const rows = [{ category: 'UTILITIES', amount: 150_000 }]
    expect(aggregateByCategory(rows)['UTILITIES']).toBe(150_000)
  })
})

// ── Traffic-light CSS helpers ─────────────────────────────────────────────────

describe('trafficLightBg', () => {
  it('returns correct bg class for each status', () => {
    expect(trafficLightBg('green')).toBe('bg-green-500')
    expect(trafficLightBg('amber')).toBe('bg-amber-500')
    expect(trafficLightBg('red')).toBe('bg-red-500')
  })
})

describe('trafficLightText', () => {
  it('returns correct text class for each status', () => {
    expect(trafficLightText('green')).toBe('text-green-600')
    expect(trafficLightText('amber')).toBe('text-amber-600')
    expect(trafficLightText('red')).toBe('text-red-600')
  })
})
