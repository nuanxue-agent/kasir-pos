import { describe, it, expect } from 'vitest'
import {
  assignTier,
  assignTierFromDB,
  detectTierUpgrade,
  calcChallengeProgress,
  calcVisitStreak,
  isChallengeStreakMet,
  applyBonusMultiplier,
  calcNextTierProgress,
  DEFAULT_TIERS,
  type TierConfig,
} from '@/lib/loyalty-tiers'

// ─── assignTier ───────────────────────────────────────────────────────────────

describe('assignTier', () => {
  it('assigns Bronze at 0 points', () => {
    expect(assignTier(0).name).toBe('Bronze')
  })

  it('assigns Silver at exactly 1000 points', () => {
    expect(assignTier(1000).name).toBe('Silver')
  })

  it('assigns Gold at 5000 points', () => {
    expect(assignTier(5000).name).toBe('Gold')
  })

  it('assigns Platinum at 15000 points', () => {
    expect(assignTier(15000).name).toBe('Platinum')
  })

  it('assigns Platinum above 15000 (no upper bound)', () => {
    expect(assignTier(99999).name).toBe('Platinum')
  })

  it('assigns correct tier with custom tiers array', () => {
    const custom: TierConfig[] = [
      { name: 'Bronze', minPoints: 0, maxPoints: 99, discountPct: 0, bonusMultiplier: 1, badgeColor: '#CD7F32', badgeIcon: '🥉', benefits: [] },
      { name: 'Silver', minPoints: 100, maxPoints: null, discountPct: 5, bonusMultiplier: 1.5, badgeColor: '#C0C0C0', badgeIcon: '🥈', benefits: [] },
    ]
    expect(assignTier(50, custom).name).toBe('Bronze')
    expect(assignTier(100, custom).name).toBe('Silver')
  })
})

// ─── detectTierUpgrade ────────────────────────────────────────────────────────

describe('detectTierUpgrade', () => {
  it('detects upgrade from Bronze to Silver', () => {
    const result = detectTierUpgrade(800, 1200)
    expect(result.upgraded).toBe(true)
    expect(result.previous.name).toBe('Bronze')
    expect(result.current.name).toBe('Silver')
  })

  it('returns upgraded=false when tier stays the same', () => {
    const result = detectTierUpgrade(1000, 1500)
    expect(result.upgraded).toBe(false)
    expect(result.current.name).toBe('Silver')
  })

  it('detects upgrade from Silver to Gold', () => {
    const result = detectTierUpgrade(4500, 5001)
    expect(result.upgraded).toBe(true)
    expect(result.current.name).toBe('Gold')
  })
})

// ─── calcChallengeProgress ────────────────────────────────────────────────────

describe('calcChallengeProgress', () => {
  it('adds increment to current progress', () => {
    const { progress } = calcChallengeProgress(3, 2, 10)
    expect(progress).toBe(5)
  })

  it('marks completed when progress reaches target', () => {
    const { completed } = calcChallengeProgress(9, 1, 10)
    expect(completed).toBe(true)
  })

  it('marks completed when progress exceeds target', () => {
    const { completed, progress } = calcChallengeProgress(8, 5, 10)
    expect(completed).toBe(true)
    expect(progress).toBe(13)
  })

  it('returns pctComplete capped at 100', () => {
    const { pctComplete } = calcChallengeProgress(15, 0, 10)
    expect(pctComplete).toBe(100)
  })

  it('does not allow progress below 0', () => {
    const { progress } = calcChallengeProgress(0, -5, 10)
    expect(progress).toBe(0)
  })
})

// ─── calcVisitStreak ──────────────────────────────────────────────────────────

describe('calcVisitStreak', () => {
  it('returns 0 for empty visit list', () => {
    expect(calcVisitStreak([])).toBe(0)
  })

  it('returns 1 for a single visit today', () => {
    const today = new Date().toISOString().slice(0, 10)
    expect(calcVisitStreak([today])).toBe(1)
  })

  it('computes a 3-day streak', () => {
    const asOf = '2025-07-10'
    const visits = ['2025-07-08', '2025-07-09', '2025-07-10']
    expect(calcVisitStreak(visits, asOf)).toBe(3)
  })

  it('stops streak at a gap day', () => {
    const asOf = '2025-07-10'
    const visits = ['2025-07-07', '2025-07-09', '2025-07-10'] // gap on 08
    expect(calcVisitStreak(visits, asOf)).toBe(2)
  })

  it('deduplicates multiple visits on the same day', () => {
    const asOf = '2025-07-03'
    const visits = [
      '2025-07-01T09:00:00Z',
      '2025-07-01T15:00:00Z',
      '2025-07-02T10:00:00Z',
      '2025-07-03T08:00:00Z',
    ]
    expect(calcVisitStreak(visits, asOf)).toBe(3)
  })
})

// ─── applyBonusMultiplier ─────────────────────────────────────────────────────

describe('applyBonusMultiplier', () => {
  it('returns base points when multiplier is 1', () => {
    expect(applyBonusMultiplier(100, 1)).toBe(100)
  })

  it('applies Platinum 2x multiplier', () => {
    expect(applyBonusMultiplier(100, 2)).toBe(200)
  })

  it('rounds fractional results', () => {
    // 100 * 1.25 = 125
    expect(applyBonusMultiplier(100, 1.25)).toBe(125)
  })

  it('returns 0 for negative base points', () => {
    expect(applyBonusMultiplier(-50, 1.5)).toBe(0)
  })
})

// ─── assignTierFromDB ─────────────────────────────────────────────────────────

describe('assignTierFromDB', () => {
  const dbTiers = DEFAULT_TIERS.map((t) => ({
    name: t.name,
    minPoints: t.minPoints,
    maxPoints: t.maxPoints,
    discountPct: t.discountPct,
    bonusMultiplier: t.bonusMultiplier,
  }))

  it('returns null for empty tiers list', () => {
    expect(assignTierFromDB(500, [])).toBeNull()
  })

  it('assigns correct tier by points', () => {
    const tier = assignTierFromDB(6000, dbTiers)
    expect(tier?.name).toBe('Gold')
  })
})

// ─── calcNextTierProgress ─────────────────────────────────────────────────────

describe('calcNextTierProgress', () => {
  it('returns nextTier=null for Platinum (max tier)', () => {
    const { nextTier, pctProgress } = calcNextTierProgress(20000)
    expect(nextTier).toBeNull()
    expect(pctProgress).toBe(100)
  })

  it('calculates points needed to reach Silver from Bronze', () => {
    const { nextTier, pointsNeeded } = calcNextTierProgress(500)
    expect(nextTier?.name).toBe('Silver')
    expect(pointsNeeded).toBe(500) // need 1000, have 500
  })

  it('calculates percentage progress within a tier range', () => {
    // Bronze: 0-999, Silver starts at 1000
    // At 500 points: 500/1000 = 50%
    const { pctProgress } = calcNextTierProgress(500)
    expect(pctProgress).toBe(50)
  })
})
