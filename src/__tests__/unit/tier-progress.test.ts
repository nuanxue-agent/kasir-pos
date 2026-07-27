import { describe, it, expect } from 'vitest'
import {
  getCurrentTier,
  getNextTier,
  getTierProgressPercent,
  getPointsToNextTier,
  detectTierUpgrade,
  detectNewMilestones,
  rankLeaderboard,
  DEFAULT_TIERS,
  type TierDef,
  type CustomerStats,
  type MilestoneType,
} from '@/lib/tier-progress'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const tiers: TierDef[] = DEFAULT_TIERS

// ─── 1. Tier threshold calculation ───────────────────────────────────────────

describe('getCurrentTier', () => {
  it('returns Bronze for 0 points', () => {
    expect(getCurrentTier(0, tiers).name).toBe('Bronze')
  })

  it('returns Bronze for points below Silver threshold', () => {
    expect(getCurrentTier(499, tiers).name).toBe('Bronze')
  })

  it('returns Silver at exactly the Silver threshold', () => {
    expect(getCurrentTier(500, tiers).name).toBe('Silver')
  })

  it('returns Gold at exactly the Gold threshold', () => {
    expect(getCurrentTier(1_000, tiers).name).toBe('Gold')
  })

  it('returns Platinum at exactly the Platinum threshold', () => {
    expect(getCurrentTier(5_000, tiers).name).toBe('Platinum')
  })

  it('returns Platinum for points well above Platinum threshold', () => {
    expect(getCurrentTier(99_999, tiers).name).toBe('Platinum')
  })
})

// ─── 2. Progress percentage ───────────────────────────────────────────────────

describe('getTierProgressPercent', () => {
  it('returns 0% at Bronze start (0 pts)', () => {
    expect(getTierProgressPercent(0, tiers)).toBe(0)
  })

  it('returns 50% halfway from Bronze to Silver (250 pts)', () => {
    // Bronze 0, Silver 500 → 250/500 = 50%
    expect(getTierProgressPercent(250, tiers)).toBe(50)
  })

  it('returns 100% at Platinum (no next tier)', () => {
    expect(getTierProgressPercent(5_000, tiers)).toBe(100)
  })

  it('returns 100% for points beyond Platinum', () => {
    expect(getTierProgressPercent(100_000, tiers)).toBe(100)
  })

  it('returns correct percent in mid-Gold range', () => {
    // Gold 1000, Platinum 5000 → range 4000; at 3000 pts → progress 2000/4000 = 50%
    expect(getTierProgressPercent(3_000, tiers)).toBe(50)
  })
})

describe('getPointsToNextTier', () => {
  it('returns 500 from 0 pts (Bronze → Silver)', () => {
    expect(getPointsToNextTier(0, tiers)).toBe(500)
  })

  it('returns 250 from 250 pts', () => {
    expect(getPointsToNextTier(250, tiers)).toBe(250)
  })

  it('returns 0 at Platinum (no next tier)', () => {
    expect(getPointsToNextTier(5_000, tiers)).toBe(0)
  })
})

// ─── 3. Milestone detection logic ────────────────────────────────────────────

describe('detectNewMilestones', () => {
  it('detects FIRST_PURCHASE on first order', () => {
    const stats: CustomerStats = {
      points: 10,
      totalOrders: 1,
      totalSpend: 10_000,
      currentTierName: 'Bronze',
    }
    const result = detectNewMilestones(stats, new Set())
    expect(result).toContain('FIRST_PURCHASE')
  })

  it('does not re-detect already achieved milestones', () => {
    const stats: CustomerStats = {
      points: 10,
      totalOrders: 1,
      totalSpend: 10_000,
      currentTierName: 'Bronze',
    }
    const alreadyAchieved = new Set<MilestoneType>(['FIRST_PURCHASE'])
    const result = detectNewMilestones(stats, alreadyAchieved)
    expect(result).not.toContain('FIRST_PURCHASE')
  })

  it('detects SPEND_100K when totalSpend reaches threshold', () => {
    const stats: CustomerStats = {
      points: 100,
      totalOrders: 5,
      totalSpend: 100_000,
      currentTierName: 'Bronze',
    }
    const result = detectNewMilestones(stats, new Set())
    expect(result).toContain('SPEND_100K')
  })

  it('detects PURCHASE_10 at exactly 10 orders', () => {
    const stats: CustomerStats = {
      points: 100,
      totalOrders: 10,
      totalSpend: 500_000,
      currentTierName: 'Bronze',
    }
    const result = detectNewMilestones(stats, new Set())
    expect(result).toContain('PURCHASE_10')
  })

  it('detects tier milestone TIER_SILVER when tier is Silver', () => {
    const stats: CustomerStats = {
      points: 500,
      totalOrders: 10,
      totalSpend: 500_000,
      currentTierName: 'Silver',
    }
    const result = detectNewMilestones(stats, new Set())
    expect(result).toContain('TIER_SILVER')
  })
})

// ─── 4. Leaderboard ranking ───────────────────────────────────────────────────

describe('rankLeaderboard', () => {
  it('ranks customers by points descending', () => {
    const customers = [
      { customerId: 'b', name: 'Bob', points: 200 },
      { customerId: 'a', name: 'Alice', points: 500 },
      { customerId: 'c', name: 'Carol', points: 100 },
    ]
    const result = rankLeaderboard(customers, tiers, 10)
    expect(result[0].name).toBe('Alice')
    expect(result[1].name).toBe('Bob')
    expect(result[2].name).toBe('Carol')
  })

  it('assigns rank 1 to top customer', () => {
    const customers = [
      { customerId: 'a', name: 'Alice', points: 1000 },
      { customerId: 'b', name: 'Bob', points: 500 },
    ]
    const result = rankLeaderboard(customers, tiers, 10)
    expect(result[0].rank).toBe(1)
  })

  it('ties share the same rank', () => {
    const customers = [
      { customerId: 'a', name: 'Alice', points: 500 },
      { customerId: 'b', name: 'Bob', points: 500 },
      { customerId: 'c', name: 'Carol', points: 100 },
    ]
    const result = rankLeaderboard(customers, tiers, 10)
    expect(result[0].rank).toBe(1)
    expect(result[1].rank).toBe(1)
    expect(result[2].rank).toBe(3)
  })

  it('limits results to the specified limit', () => {
    const customers = Array.from({ length: 20 }, (_, i) => ({
      customerId: `c${i}`,
      name: `Customer ${i}`,
      points: 1000 - i * 10,
    }))
    const result = rankLeaderboard(customers, tiers, 10)
    expect(result).toHaveLength(10)
  })

  it('attaches tier info from points', () => {
    const customers = [{ customerId: 'a', name: 'Alice', points: 1000 }]
    const result = rankLeaderboard(customers, tiers, 10)
    expect(result[0].tierName).toBe('Gold')
    expect(result[0].tierIcon).toBe('🥇')
  })
})

// ─── 5. Upgrade notification logic ───────────────────────────────────────────

describe('detectTierUpgrade', () => {
  it('returns null when no tier change', () => {
    expect(detectTierUpgrade(100, 200, tiers)).toBeNull()
  })

  it('returns new tier when crossing Silver threshold', () => {
    const result = detectTierUpgrade(490, 510, tiers)
    expect(result).not.toBeNull()
    expect(result?.name).toBe('Silver')
  })

  it('returns Gold when crossing Gold threshold', () => {
    const result = detectTierUpgrade(990, 1010, tiers)
    expect(result?.name).toBe('Gold')
  })

  it('returns Platinum when crossing Platinum threshold', () => {
    const result = detectTierUpgrade(4990, 5010, tiers)
    expect(result?.name).toBe('Platinum')
  })

  it('returns null for downward point movement (no downgrade)', () => {
    // Points went down, stays in same tier
    const result = detectTierUpgrade(1000, 800, tiers)
    expect(result).toBeNull()
  })
})
