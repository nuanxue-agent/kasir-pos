import { describe, it, expect } from 'vitest'
import {
  calcAchievementPct,
  calcGoalStatus,
  calcTrend,
  validateTarget,
  getPeriodDateRange,
} from '@/components/reports/KpiGoalsClient'

// ── Achievement percentage ────────────────────────────────────────────────────

describe('calcAchievementPct', () => {
  it('returns correct percentage when actual is less than target', () => {
    expect(calcAchievementPct(750_000, 1_000_000)).toBeCloseTo(75)
  })

  it('returns 100 when actual equals target', () => {
    expect(calcAchievementPct(500_000, 500_000)).toBe(100)
  })

  it('returns more than 100 when actual exceeds target', () => {
    expect(calcAchievementPct(1_200_000, 1_000_000)).toBeCloseTo(120)
  })

  it('returns 0 when both actual and target are 0', () => {
    expect(calcAchievementPct(0, 0)).toBe(0)
  })

  it('returns 100 when target is 0 but actual is positive', () => {
    expect(calcAchievementPct(500, 0)).toBe(100)
  })
})

// ── Period date range computation ─────────────────────────────────────────────

describe('getPeriodDateRange', () => {
  it('returns correct monthly range for March 2024', () => {
    const { startDate, endDate } = getPeriodDateRange('MONTHLY', 2024, 3, null)
    expect(startDate.getFullYear()).toBe(2024)
    expect(startDate.getMonth()).toBe(2) // 0-indexed
    expect(startDate.getDate()).toBe(1)
    expect(endDate.getMonth()).toBe(2)
    expect(endDate.getDate()).toBe(31)
  })

  it('returns correct quarterly range for Q2 2024', () => {
    const { startDate, endDate } = getPeriodDateRange('QUARTERLY', 2024, null, 2)
    expect(startDate.getMonth()).toBe(3) // April
    expect(endDate.getMonth()).toBe(5)   // June
    expect(endDate.getDate()).toBe(30)
  })

  it('returns correct yearly range for 2023', () => {
    const { startDate, endDate } = getPeriodDateRange('YEARLY', 2023, null, null)
    expect(startDate.getFullYear()).toBe(2023)
    expect(startDate.getMonth()).toBe(0)
    expect(startDate.getDate()).toBe(1)
    expect(endDate.getMonth()).toBe(11)
    expect(endDate.getDate()).toBe(31)
  })
})

// ── Goal status ───────────────────────────────────────────────────────────────

describe('calcGoalStatus', () => {
  const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days ahead
  const pastDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)   // 1 day ago
  const now = new Date()

  it('returns ACHIEVED when achievement is >= 100%', () => {
    expect(calcGoalStatus(100, futureDate, now)).toBe('ACHIEVED')
  })

  it('returns ACHIEVED even when period has ended if 100%+', () => {
    expect(calcGoalStatus(110, pastDate, now)).toBe('ACHIEVED')
  })

  it('returns MISSED when period ended and achievement < 100%', () => {
    expect(calcGoalStatus(80, pastDate, now)).toBe('MISSED')
  })

  it('returns ON_TRACK when period is active and achievement >= 70%', () => {
    expect(calcGoalStatus(85, futureDate, now)).toBe('ON_TRACK')
  })

  it('returns AT_RISK when period is active and achievement < 70%', () => {
    expect(calcGoalStatus(50, futureDate, now)).toBe('AT_RISK')
  })
})

// ── Trend vs previous period ──────────────────────────────────────────────────

describe('calcTrend', () => {
  it('returns positive trend when current is higher than previous', () => {
    const trend = calcTrend(1_200_000, 1_000_000)
    expect(trend).toBeCloseTo(20)
  })

  it('returns negative trend when current is lower than previous', () => {
    const trend = calcTrend(800_000, 1_000_000)
    expect(trend).toBeCloseTo(-20)
  })

  it('returns 0 when current equals previous', () => {
    expect(calcTrend(1_000_000, 1_000_000)).toBeCloseTo(0)
  })

  it('returns null when previous is null', () => {
    expect(calcTrend(500_000, null)).toBeNull()
  })

  it('returns null when previous is 0', () => {
    expect(calcTrend(500_000, 0)).toBeNull()
  })
})

// ── Target validation ─────────────────────────────────────────────────────────

describe('validateTarget', () => {
  it('returns true for a positive number', () => {
    expect(validateTarget(1_000_000)).toBe(true)
  })

  it('returns false for zero', () => {
    expect(validateTarget(0)).toBe(false)
  })

  it('returns false for a negative number', () => {
    expect(validateTarget(-500)).toBe(false)
  })

  it('returns false for NaN', () => {
    expect(validateTarget(NaN)).toBe(false)
  })

  it('returns false for Infinity', () => {
    expect(validateTarget(Infinity)).toBe(false)
  })
})
