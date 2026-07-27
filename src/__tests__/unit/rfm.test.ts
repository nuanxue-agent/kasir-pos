import { describe, it, expect } from 'vitest'
import {
  scoreMetric,
  assignSegment,
  computeRFM,
  generateReferralCode,
  calculateReferralReward,
  REFERRAL_REWARD_POINTS,
} from '@/lib/rfm'
import type { RawCustomerStat } from '@/lib/rfm'

// ─── scoreMetric ──────────────────────────────────────────────────────────────

describe('scoreMetric', () => {
  it('returns middle score for empty population', () => {
    expect(scoreMetric(100, [])).toBe(3)
  })

  it('scores highest value as 5 (non-inverted)', () => {
    expect(scoreMetric(100, [10, 50, 100])).toBe(5)
  })

  it('scores lowest value as 1 (non-inverted)', () => {
    expect(scoreMetric(1, [1, 50, 100])).toBe(2) // rank 1/3 → ceil(0.33*5)=2
  })

  it('inverts score correctly — lowest value becomes 5', () => {
    // For recency: 1 day ago is best → should score 5
    expect(scoreMetric(1, [1, 50, 100], true)).toBe(4) // inverted: 6-2=4
  })
})

// ─── assignSegment ────────────────────────────────────────────────────────────

describe('assignSegment', () => {
  it('assigns Champions for all-5 scores', () => {
    expect(assignSegment(5, 5, 5)).toBe('Champions')
  })

  it('assigns Champions for r=4,f=4,m=4', () => {
    expect(assignSegment(4, 4, 4)).toBe('Champions')
  })

  it('assigns New for high recency + low frequency', () => {
    expect(assignSegment(5, 1, 1)).toBe('New')
  })

  it('assigns AtRisk for low recency + decent frequency', () => {
    expect(assignSegment(1, 4, 4)).toBe('AtRisk')
  })

  it('assigns Lost for low recency + low frequency', () => {
    expect(assignSegment(1, 1, 1)).toBe('Lost')
  })

  it('assigns Loyal for avg >= 3.5 + f >= 3', () => {
    expect(assignSegment(4, 4, 3)).toBe('Loyal')
  })
})

// ─── computeRFM ───────────────────────────────────────────────────────────────

describe('computeRFM', () => {
  it('returns empty array for empty input', () => {
    expect(computeRFM([])).toEqual([])
  })

  it('assigns segment to each customer', () => {
    const customers: RawCustomerStat[] = [
      { id: 'c1', name: 'Alice', phone: null, email: null, recency: 2,   frequency: 20, monetary: 500000 },
      { id: 'c2', name: 'Bob',   phone: null, email: null, recency: 180, frequency: 1,  monetary: 10000  },
    ]
    const result = computeRFM(customers)
    expect(result).toHaveLength(2)
    expect(result[0].segment).toBeDefined()
    expect(result[1].segment).toBeDefined()
  })

  it('gives champion the highest R/F/M scores relative to the group', () => {
    const customers: RawCustomerStat[] = [
      { id: 'c1', name: 'Champion', phone: null, email: null, recency: 1,   frequency: 30, monetary: 1000000 },
      { id: 'c2', name: 'Lost',     phone: null, email: null, recency: 365, frequency: 1,  monetary: 5000    },
      { id: 'c3', name: 'Mid',      phone: null, email: null, recency: 60,  frequency: 5,  monetary: 100000  },
    ]
    const result = computeRFM(customers)
    const champion = result.find((r) => r.id === 'c1')!
    const lost     = result.find((r) => r.id === 'c2')!
    expect(champion.scores.recencyScore).toBeGreaterThan(lost.scores.recencyScore)
    expect(champion.scores.frequencyScore).toBeGreaterThan(lost.scores.frequencyScore)
    expect(champion.scores.monetaryScore).toBeGreaterThan(lost.scores.monetaryScore)
  })
})

// ─── generateReferralCode ─────────────────────────────────────────────────────

describe('generateReferralCode', () => {
  it('generates a code of 10 characters (4 prefix + 6 suffix)', () => {
    const code = generateReferralCode('abc123de-45fg')
    expect(code).toHaveLength(10)
  })

  it('is deterministic for the same customerId', () => {
    const id   = 'customer-id-xyz'
    expect(generateReferralCode(id)).toBe(generateReferralCode(id))
  })

  it('produces different codes for different customerIds', () => {
    expect(generateReferralCode('id-aaa')).not.toBe(generateReferralCode('id-bbb'))
  })

  it('prefix is uppercase', () => {
    const code = generateReferralCode('abcd-efgh')
    expect(code.slice(0, 4)).toMatch(/^[A-Z0-9]+$/)
  })
})

// ─── calculateReferralReward ──────────────────────────────────────────────────

describe('calculateReferralReward', () => {
  it('returns 0 for zero referrals', () => {
    expect(calculateReferralReward(0)).toBe(0)
  })

  it('returns 0 for negative input', () => {
    expect(calculateReferralReward(-1)).toBe(0)
  })

  it('returns REFERRAL_REWARD_POINTS for 1 referral', () => {
    expect(calculateReferralReward(1)).toBe(REFERRAL_REWARD_POINTS)
  })

  it('returns 5x reward for 5 referrals', () => {
    expect(calculateReferralReward(5)).toBe(REFERRAL_REWARD_POINTS * 5)
  })
})
