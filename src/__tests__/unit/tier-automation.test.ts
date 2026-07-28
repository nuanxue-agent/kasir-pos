import { describe, it, expect } from 'vitest'
import {
  qualifiesForTier,
  findBestTier,
  evaluateCustomerTier,
  batchEvaluateTiers,
  calcPeriodSpend,
  calcPeriodVisits,
  getTierChangeDirection,
} from '@/lib/tier-automation'
import type { TierRule, CustomerActivity } from '@/lib/tier-automation'

// ── Fixtures ────────────────────────────────────────────────────────────────

const bronze: TierRule = {
  id: 'r1', storeId: 's1', tierName: 'Bronze',
  minSpend: 100_000, minPoints: 0, minVisits: 0, periodDays: 0,
  benefits: { discount: '2%' }, color: '#cd7f32', icon: 'star', active: true,
}

const silver: TierRule = {
  id: 'r2', storeId: 's1', tierName: 'Silver',
  minSpend: 500_000, minPoints: 500, minVisits: 5, periodDays: 0,
  benefits: { discount: '5%', freeShipping: 'yes' }, color: '#c0c0c0', icon: 'star', active: true,
}

const gold: TierRule = {
  id: 'r3', storeId: 's1', tierName: 'Gold',
  minSpend: 1_000_000, minPoints: 1000, minVisits: 10, periodDays: 0,
  benefits: { discount: '10%', priority: 'yes' }, color: '#ffd700', icon: 'trophy', active: true,
}

const rules = [bronze, silver, gold]

function makeCustomer(overrides: Partial<CustomerActivity> = {}): CustomerActivity {
  return {
    customerId: 'c1', storeId: 's1',
    totalSpend: 0, totalPoints: 0, totalVisits: 0,
    currentTier: null,
    ...overrides,
  }
}

// ── 1. Tier qualification — spend only ──────────────────────────────────────

describe('qualifiesForTier', () => {
  it('qualifies when all criteria met', () => {
    const activity = makeCustomer({ totalSpend: 600_000, totalPoints: 600, totalVisits: 6 })
    expect(qualifiesForTier(activity, silver)).toBe(true)
  })

  it('does not qualify when spend below threshold', () => {
    const activity = makeCustomer({ totalSpend: 400_000, totalPoints: 600, totalVisits: 6 })
    expect(qualifiesForTier(activity, silver)).toBe(false)
  })

  it('does not qualify when points below threshold (AND logic)', () => {
    const activity = makeCustomer({ totalSpend: 600_000, totalPoints: 400, totalVisits: 6 })
    expect(qualifiesForTier(activity, silver)).toBe(false)
  })

  it('does not qualify when visits below threshold (AND logic)', () => {
    const activity = makeCustomer({ totalSpend: 600_000, totalPoints: 600, totalVisits: 3 })
    expect(qualifiesForTier(activity, silver)).toBe(false)
  })

  it('qualifies for spend-only rule when points/visits are 0 thresholds', () => {
    const activity = makeCustomer({ totalSpend: 150_000 })
    expect(qualifiesForTier(activity, bronze)).toBe(true)
  })
})

// ── 2. Multiple criteria AND logic ──────────────────────────────────────────

describe('findBestTier', () => {
  it('returns null when no rules qualify', () => {
    const activity = makeCustomer({ totalSpend: 50_000 })
    expect(findBestTier(activity, rules)).toBeNull()
  })

  it('returns highest qualifying tier by minSpend', () => {
    const activity = makeCustomer({ totalSpend: 1_200_000, totalPoints: 1200, totalVisits: 12 })
    const best = findBestTier(activity, rules)
    expect(best?.tierName).toBe('Gold')
  })

  it('returns mid tier when not yet qualifying for top', () => {
    const activity = makeCustomer({ totalSpend: 600_000, totalPoints: 600, totalVisits: 6 })
    const best = findBestTier(activity, rules)
    expect(best?.tierName).toBe('Silver')
  })
})

// ── 3. Upgrade logic ────────────────────────────────────────────────────────

describe('evaluateCustomerTier — upgrade', () => {
  it('upgrades customer from Bronze to Silver when thresholds met', () => {
    const activity = makeCustomer({ totalSpend: 600_000, totalPoints: 600, totalVisits: 6, currentTier: 'Bronze' })
    const result = evaluateCustomerTier(activity, rules)
    expect(result.changed).toBe(true)
    expect(result.qualifiedTier).toBe('Silver')
    expect(result.reason).toMatch(/Upgraded/)
  })

  it('assigns new tier when customer had no tier', () => {
    const activity = makeCustomer({ totalSpend: 150_000, currentTier: null })
    const result = evaluateCustomerTier(activity, rules)
    expect(result.changed).toBe(true)
    expect(result.qualifiedTier).toBe('Bronze')
    expect(result.reason).toMatch(/Assigned/)
  })
})

// ── 4. Downgrade logic ──────────────────────────────────────────────────────

describe('evaluateCustomerTier — downgrade', () => {
  it('downgrades customer from Gold to Silver when Gold thresholds no longer met', () => {
    // Customer has Gold tier but now only meets Silver criteria
    const activity = makeCustomer({ totalSpend: 600_000, totalPoints: 600, totalVisits: 6, currentTier: 'Gold' })
    const result = evaluateCustomerTier(activity, rules)
    expect(result.changed).toBe(true)
    expect(result.qualifiedTier).toBe('Silver')
    expect(result.reason).toMatch(/Downgraded/)
  })

  it('removes tier when customer no longer qualifies for any', () => {
    const activity = makeCustomer({ totalSpend: 10_000, currentTier: 'Bronze' })
    const result = evaluateCustomerTier(activity, rules)
    expect(result.changed).toBe(true)
    expect(result.qualifiedTier).toBeNull()
    expect(result.reason).toMatch(/Removed/)
  })

  it('no change when tier already matches best qualifying tier', () => {
    const activity = makeCustomer({ totalSpend: 600_000, totalPoints: 600, totalVisits: 6, currentTier: 'Silver' })
    const result = evaluateCustomerTier(activity, rules)
    expect(result.changed).toBe(false)
  })
})

// ── 5. Period-based spend calculation ───────────────────────────────────────

describe('calcPeriodSpend', () => {
  const now = new Date('2025-07-01T12:00:00Z')
  const txns = [
    { amount: 100_000, date: '2025-06-25T10:00:00Z' }, // 6 days ago
    { amount: 200_000, date: '2025-06-01T10:00:00Z' }, // 30 days ago
    { amount: 50_000,  date: '2025-04-01T10:00:00Z' }, // ~90 days ago
  ]

  it('sums all transactions when periodDays is 0', () => {
    expect(calcPeriodSpend(txns, 0, now)).toBe(350_000)
  })

  it('only counts transactions within rolling window', () => {
    expect(calcPeriodSpend(txns, 7, now)).toBe(100_000)
  })

  it('excludes transactions before the cutoff boundary', () => {
    // 30-day window from July 1 → cutoff is June 1 12:00Z.
    // The June 1 10:00Z transaction falls before the cutoff, so only the June 25 one counts.
    expect(calcPeriodSpend(txns, 30, now)).toBe(100_000)
  })
})

// ── 6. Batch evaluation ─────────────────────────────────────────────────────

describe('batchEvaluateTiers', () => {
  it('returns only changed evaluations', () => {
    const activities: CustomerActivity[] = [
      makeCustomer({ customerId: 'c1', totalSpend: 600_000, totalPoints: 600, totalVisits: 6, currentTier: 'Bronze' }), // will upgrade
      makeCustomer({ customerId: 'c2', totalSpend: 600_000, totalPoints: 600, totalVisits: 6, currentTier: 'Silver' }), // no change
      makeCustomer({ customerId: 'c3', totalSpend: 10_000, currentTier: 'Bronze' }),  // will remove
    ]
    const results = batchEvaluateTiers(activities, rules)
    expect(results).toHaveLength(2)
    expect(results.map(r => r.customerId)).toContain('c1')
    expect(results.map(r => r.customerId)).toContain('c3')
  })
})

// ── 7. Tier history / change direction ──────────────────────────────────────

describe('getTierChangeDirection', () => {
  it('returns "upgrade" when moving to higher-spend tier', () => {
    expect(getTierChangeDirection('Bronze', 'Silver', rules)).toBe('upgrade')
  })

  it('returns "downgrade" when moving to lower-spend tier', () => {
    expect(getTierChangeDirection('Gold', 'Bronze', rules)).toBe('downgrade')
  })

  it('returns "new" when fromTier is null', () => {
    expect(getTierChangeDirection(null, 'Bronze', rules)).toBe('new')
  })

  it('returns "removed" when toTier is null', () => {
    expect(getTierChangeDirection('Silver', null, rules)).toBe('removed')
  })

  it('returns "none" when tiers are the same', () => {
    expect(getTierChangeDirection('Gold', 'Gold', rules)).toBe('none')
  })
})
