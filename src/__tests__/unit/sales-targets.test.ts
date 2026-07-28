import { describe, it, expect } from 'vitest'
import {
  calcAchievementPct,
  isOverAchieved,
  dateRangesOverlap,
  calcPeriodBoundaries,
  rankByAchievement,
  getCurrentPeriodString,
  filterByPeriod,
} from '@/lib/sales-targets'
import type { AchievementWithTarget, TargetPeriod } from '@/lib/sales-targets'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeAchievement(
  id: string,
  achievementPct: number,
  period = '2025-01',
  targetName = `Target ${id}`
): AchievementWithTarget {
  return {
    id,
    targetId: `tgt-${id}`,
    storeId: 'store-1',
    actualAmount: achievementPct * 1000,
    achievementPct,
    period,
    computedAt: '2025-01-15T10:00:00.000Z',
    targetName,
    isOverAchieved: achievementPct >= 100,
  }
}

// ── Achievement Percentage Calculation ────────────────────────────────────────

describe('calcAchievementPct', () => {
  it('calculates correct percentage for partial achievement', () => {
    expect(calcAchievementPct(750_000, 1_000_000)).toBe(75)
  })

  it('calculates 100% when actual equals target', () => {
    expect(calcAchievementPct(1_000_000, 1_000_000)).toBe(100)
  })

  it('calculates over 100% for over-achievement', () => {
    expect(calcAchievementPct(1_250_000, 1_000_000)).toBe(125)
  })

  it('returns 0 when target is 0 (division guard)', () => {
    expect(calcAchievementPct(500, 0)).toBe(0)
  })

  it('returns 0 when actual is 0', () => {
    expect(calcAchievementPct(0, 1_000_000)).toBe(0)
  })
})

// ── Over-Achievement Detection ────────────────────────────────────────────────

describe('isOverAchieved', () => {
  it('returns true at exactly 100%', () => {
    expect(isOverAchieved(100)).toBe(true)
  })

  it('returns true above 100%', () => {
    expect(isOverAchieved(125)).toBe(true)
  })

  it('returns false below 100%', () => {
    expect(isOverAchieved(99)).toBe(false)
  })

  it('returns false at 0%', () => {
    expect(isOverAchieved(0)).toBe(false)
  })
})

// ── Target Period Overlap Detection ──────────────────────────────────────────

describe('dateRangesOverlap', () => {
  it('detects fully overlapping ranges', () => {
    expect(dateRangesOverlap('2025-01-01', '2025-01-31', '2025-01-10', '2025-01-20')).toBe(true)
  })

  it('detects partially overlapping ranges', () => {
    expect(dateRangesOverlap('2025-01-01', '2025-01-20', '2025-01-15', '2025-02-01')).toBe(true)
  })

  it('returns false for non-overlapping ranges', () => {
    expect(dateRangesOverlap('2025-01-01', '2025-01-31', '2025-02-01', '2025-02-28')).toBe(false)
  })

  it('returns false when ranges are adjacent (touching boundary)', () => {
    // end of A == start of B — not strictly overlapping
    expect(dateRangesOverlap('2025-01-01', '2025-01-31', '2025-01-31', '2025-02-28')).toBe(false)
  })

  it('detects same range as overlapping', () => {
    expect(dateRangesOverlap('2025-01-01', '2025-01-31', '2025-01-01', '2025-01-31')).toBe(true)
  })
})

// ── Leaderboard Ranking ───────────────────────────────────────────────────────

describe('rankByAchievement', () => {
  const a1 = makeAchievement('1', 80)
  const a2 = makeAchievement('2', 120)
  const a3 = makeAchievement('3', 55)
  const a4 = makeAchievement('4', 100)

  it('ranks by achievement percentage descending', () => {
    const ranked = rankByAchievement([a1, a2, a3, a4])
    expect(ranked.map(r => r.achievementPct)).toEqual([120, 100, 80, 55])
  })

  it('puts over-achiever first', () => {
    const ranked = rankByAchievement([a1, a2, a3])
    expect(ranked[0].achievementPct).toBe(120)
  })

  it('does not mutate original array', () => {
    const original = [a1, a2, a3]
    rankByAchievement(original)
    expect(original[0].achievementPct).toBe(80)
  })

  it('handles empty array', () => {
    expect(rankByAchievement([])).toEqual([])
  })
})

// ── Period Boundary Calculation ───────────────────────────────────────────────

describe('calcPeriodBoundaries', () => {
  const ref = new Date('2025-07-15T12:00:00Z') // Tuesday, mid-month

  it('returns correct monthly boundaries', () => {
    const { startDate, endDate } = calcPeriodBoundaries('MONTHLY', ref)
    expect(startDate).toBe('2025-07-01')
    expect(endDate).toBe('2025-08-01')
  })

  it('returns correct daily boundaries', () => {
    const { startDate, endDate } = calcPeriodBoundaries('DAILY', ref)
    expect(startDate).toBe('2025-07-15')
    expect(endDate).toBe('2025-07-16')
  })

  it('returns weekly boundaries starting on Monday', () => {
    const { startDate, endDate } = calcPeriodBoundaries('WEEKLY', ref)
    // July 15 2025 is a Tuesday — week starts July 14 (Monday)
    expect(startDate).toBe('2025-07-14')
    expect(endDate).toBe('2025-07-21')
  })

  it('uses current date when no reference provided', () => {
    const { startDate, endDate } = calcPeriodBoundaries('MONTHLY')
    expect(startDate).toMatch(/^\d{4}-\d{2}-01$/)
    expect(endDate).toMatch(/^\d{4}-\d{2}-01$/)
  })
})

// ── Period String Helpers ─────────────────────────────────────────────────────

describe('getCurrentPeriodString', () => {
  const ref = new Date('2025-07-15T12:00:00Z')

  it('returns YYYY-MM-DD for DAILY', () => {
    expect(getCurrentPeriodString('DAILY', ref)).toBe('2025-07-15')
  })

  it('returns YYYY-MM for MONTHLY', () => {
    expect(getCurrentPeriodString('MONTHLY', ref)).toBe('2025-07')
  })

  it('returns YYYY-Www for WEEKLY', () => {
    const str = getCurrentPeriodString('WEEKLY', ref)
    expect(str).toMatch(/^\d{4}-W\d{2}$/)
  })
})

describe('filterByPeriod', () => {
  const jan = makeAchievement('a', 80, '2025-01')
  const feb = makeAchievement('b', 90, '2025-02')
  const jan2 = makeAchievement('c', 70, '2025-01')

  it('filters to matching period only', () => {
    const result = filterByPeriod([jan, feb, jan2], '2025-01')
    expect(result.length).toBe(2)
    expect(result.every(r => r.period === '2025-01')).toBe(true)
  })

  it('returns empty array when no match', () => {
    expect(filterByPeriod([jan, feb], '2025-03')).toEqual([])
  })
})
