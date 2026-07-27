import { describe, it, expect } from 'vitest'
import {
  calcGoalProgress,
  getPeriodDateRange,
  classifyGoalStatus,
  isGoalOverdue,
  aggregateKPI,
  getGoalNotification,
} from '@/components/reports/GoalTrackerClient'

// ── Goal progress calculation ─────────────────────────────────────────────────

describe('calcGoalProgress', () => {
  it('returns 100 when current equals target', () => {
    expect(calcGoalProgress(1_000_000, 1_000_000)).toBe(100)
  })

  it('returns 50 when current is half of target', () => {
    expect(calcGoalProgress(500_000, 1_000_000)).toBe(50)
  })

  it('returns over 100 when current exceeds target', () => {
    expect(calcGoalProgress(1_200_000, 1_000_000)).toBe(120)
  })

  it('returns 0 when both current and target are 0', () => {
    expect(calcGoalProgress(0, 0)).toBe(0)
  })

  it('returns 100 when target is 0 but current > 0', () => {
    expect(calcGoalProgress(500, 0)).toBe(100)
  })
})

// ── Period date range computation ─────────────────────────────────────────────

describe('getPeriodDateRange - MONTHLY', () => {
  it('starts on the first of the month', () => {
    const ref = new Date(2025, 2, 15) // March 15
    const { startDate } = getPeriodDateRange('MONTHLY', ref)
    expect(startDate.getDate()).toBe(1)
    expect(startDate.getMonth()).toBe(2)
    expect(startDate.getFullYear()).toBe(2025)
  })

  it('ends on the last day of the month', () => {
    const ref = new Date(2025, 1, 10) // Feb 10
    const { endDate } = getPeriodDateRange('MONTHLY', ref)
    expect(endDate.getDate()).toBe(28) // 2025 is not a leap year
    expect(endDate.getMonth()).toBe(1)
  })

  it('correctly handles December (month 11)', () => {
    const ref = new Date(2025, 11, 20)
    const { startDate, endDate } = getPeriodDateRange('MONTHLY', ref)
    expect(startDate.getDate()).toBe(1)
    expect(endDate.getDate()).toBe(31)
    expect(endDate.getMonth()).toBe(11)
  })
})

describe('getPeriodDateRange - QUARTERLY', () => {
  it('Q1 starts Jan 1 and ends Mar 31', () => {
    const ref = new Date(2025, 1, 15) // Feb
    const { startDate, endDate } = getPeriodDateRange('QUARTERLY', ref)
    expect(startDate.getMonth()).toBe(0) // Jan
    expect(endDate.getMonth()).toBe(2)   // Mar
  })

  it('Q3 starts Jul 1 and ends Sep 30', () => {
    const ref = new Date(2025, 7, 1) // Aug
    const { startDate, endDate } = getPeriodDateRange('QUARTERLY', ref)
    expect(startDate.getMonth()).toBe(6) // Jul
    expect(endDate.getMonth()).toBe(8)   // Sep
    expect(endDate.getDate()).toBe(30)
  })
})

// ── KPI aggregation ───────────────────────────────────────────────────────────

describe('aggregateKPI', () => {
  it('sums revenue, orders, and newCustomers across rows', () => {
    const rows = [
      { revenue: 1_000_000, orders: 10, newCustomers: 3 },
      { revenue: 2_000_000, orders: 20, newCustomers: 5 },
      { revenue:   500_000, orders:  5, newCustomers: 1 },
    ]
    const result = aggregateKPI(rows)
    expect(result.revenue).toBe(3_500_000)
    expect(result.orders).toBe(35)
    expect(result.newCustomers).toBe(9)
  })

  it('returns zeros for empty array', () => {
    const result = aggregateKPI([])
    expect(result.revenue).toBe(0)
    expect(result.orders).toBe(0)
    expect(result.newCustomers).toBe(0)
  })
})

// ── Goal status classification ────────────────────────────────────────────────

describe('classifyGoalStatus', () => {
  it('returns ACHIEVED when progress >= 100', () => {
    expect(classifyGoalStatus(100, false)).toBe('ACHIEVED')
    expect(classifyGoalStatus(110, true)).toBe('ACHIEVED')
  })

  it('returns OVERDUE_LOW when overdue and progress < 50', () => {
    expect(classifyGoalStatus(30, true)).toBe('OVERDUE_LOW')
    expect(classifyGoalStatus(49, true)).toBe('OVERDUE_LOW')
  })

  it('returns ALMOST when progress >= 90 and not yet achieved', () => {
    expect(classifyGoalStatus(90, false)).toBe('ALMOST')
    expect(classifyGoalStatus(99, false)).toBe('ALMOST')
    expect(classifyGoalStatus(95, true)).toBe('ALMOST') // overdue but >=90, not <50
  })

  it('returns ON_TRACK otherwise', () => {
    expect(classifyGoalStatus(50, false)).toBe('ON_TRACK')
    expect(classifyGoalStatus(89, false)).toBe('ON_TRACK')
    expect(classifyGoalStatus(0, false)).toBe('ON_TRACK')
  })
})

// ── Notification threshold logic ──────────────────────────────────────────────

describe('getGoalNotification', () => {
  it('returns CONFETTI when progress >= 100', () => {
    expect(getGoalNotification(100, false)).toBe('CONFETTI')
    expect(getGoalNotification(120, true)).toBe('CONFETTI')
  })

  it('returns ALMOST when progress >= 90 and < 100', () => {
    expect(getGoalNotification(90, false)).toBe('ALMOST')
    expect(getGoalNotification(99, false)).toBe('ALMOST')
  })

  it('returns ALERT when overdue and progress < 50', () => {
    expect(getGoalNotification(45, true)).toBe('ALERT')
    expect(getGoalNotification(0, true)).toBe('ALERT')
  })

  it('returns null for normal on-track progress', () => {
    expect(getGoalNotification(50, false)).toBeNull()
    expect(getGoalNotification(89, false)).toBeNull()
    expect(getGoalNotification(60, true)).toBeNull() // overdue but >=50 and <90
  })
})

// ── isGoalOverdue ─────────────────────────────────────────────────────────────

describe('isGoalOverdue', () => {
  it('returns true when endDate is in the past', () => {
    expect(isGoalOverdue('2020-01-01T00:00:00.000Z')).toBe(true)
  })

  it('returns false when endDate is in the future', () => {
    const future = new Date(Date.now() + 86_400_000 * 30).toISOString()
    expect(isGoalOverdue(future)).toBe(false)
  })
})
