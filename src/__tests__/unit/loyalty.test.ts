import { describe, it, expect } from 'vitest'
import {
  calculatePointsEarned,
  calculatePointsValue,
  getTier,
  isEligibleForRedemption,
} from '@/lib/loyalty'
import type { LoyaltyTierDef } from '@/lib/loyalty'

// ─── Sample tiers ─────────────────────────────────────────────────────────────

const tiers: LoyaltyTierDef[] = [
  { name: 'Bronze', minPoints: 0,    discount: 0,   color: '#cd7f32', icon: '🥉' },
  { name: 'Silver', minPoints: 500,  discount: 5,   color: '#c0c0c0', icon: '🥈' },
  { name: 'Gold',   minPoints: 1000, discount: 10,  color: '#ffd700', icon: '🥇' },
  { name: 'Platinum', minPoints: 5000, discount: 15, color: '#e5e4e2', icon: '💎' },
]

// ─── calculatePointsEarned ────────────────────────────────────────────────────

describe('calculatePointsEarned', () => {
  it('returns correct points for exact multiple', () => {
    expect(calculatePointsEarned(10000, 1000)).toBe(10)
  })

  it('floors fractional result', () => {
    expect(calculatePointsEarned(1500, 1000)).toBe(1)
  })

  it('returns 0 for zero order total', () => {
    expect(calculatePointsEarned(0, 1000)).toBe(0)
  })

  it('returns 0 for negative order total', () => {
    expect(calculatePointsEarned(-500, 1000)).toBe(0)
  })

  it('returns 0 for zero rate (avoids division by zero)', () => {
    expect(calculatePointsEarned(10000, 0)).toBe(0)
  })

  it('returns 0 for negative rate', () => {
    expect(calculatePointsEarned(10000, -100)).toBe(0)
  })

  it('handles large order total correctly', () => {
    expect(calculatePointsEarned(1_000_000, 1000)).toBe(1000)
  })

  it('returns 0 when order total is less than rate unit', () => {
    expect(calculatePointsEarned(500, 1000)).toBe(0)
  })
})

// ─── calculatePointsValue ────────────────────────────────────────────────────

describe('calculatePointsValue', () => {
  it('calculates correct monetary value', () => {
    expect(calculatePointsValue(100, 1000)).toBe(100_000)
  })

  it('returns 0 for zero points', () => {
    expect(calculatePointsValue(0, 1000)).toBe(0)
  })

  it('returns 0 for negative points', () => {
    expect(calculatePointsValue(-10, 1000)).toBe(0)
  })

  it('returns 0 for zero value per point', () => {
    expect(calculatePointsValue(100, 0)).toBe(0)
  })

  it('returns 0 for negative value per point', () => {
    expect(calculatePointsValue(100, -50)).toBe(0)
  })

  it('handles fractional value per point', () => {
    expect(calculatePointsValue(3, 0.5)).toBe(1.5)
  })
})

// ─── getTier ─────────────────────────────────────────────────────────────────

describe('getTier', () => {
  it('returns null for empty tiers array', () => {
    expect(getTier(1000, [])).toBeNull()
  })

  it('returns Bronze for 0 points', () => {
    expect(getTier(0, tiers)?.name).toBe('Bronze')
  })

  it('returns Silver at exactly 500 points', () => {
    expect(getTier(500, tiers)?.name).toBe('Silver')
  })

  it('returns Silver for 999 points (just below Gold)', () => {
    expect(getTier(999, tiers)?.name).toBe('Silver')
  })

  it('returns Gold at exactly 1000 points', () => {
    expect(getTier(1000, tiers)?.name).toBe('Gold')
  })

  it('returns Platinum at exactly 5000 points', () => {
    expect(getTier(5000, tiers)?.name).toBe('Platinum')
  })

  it('returns Platinum for points above max tier', () => {
    expect(getTier(99999, tiers)?.name).toBe('Platinum')
  })

  it('returns null when no tier has minPoints ≤ current points (all tiers above)', () => {
    const highTiers: LoyaltyTierDef[] = [
      { name: 'Elite', minPoints: 10000, discount: 20, color: '#000', icon: '👑' },
    ]
    expect(getTier(500, highTiers)).toBeNull()
  })

  it('is not sensitive to input array order', () => {
    const shuffled = [...tiers].reverse()
    expect(getTier(1000, shuffled)?.name).toBe('Gold')
  })
})

// ─── isEligibleForRedemption ─────────────────────────────────────────────────

describe('isEligibleForRedemption', () => {
  it('returns true when points meet minimum', () => {
    expect(isEligibleForRedemption(100, 100)).toBe(true)
  })

  it('returns true when points exceed minimum', () => {
    expect(isEligibleForRedemption(200, 100)).toBe(true)
  })

  it('returns false when points below minimum', () => {
    expect(isEligibleForRedemption(50, 100)).toBe(false)
  })

  it('returns false for zero points with positive minimum', () => {
    expect(isEligibleForRedemption(0, 100)).toBe(false)
  })

  it('returns true for any positive points when minRedeemable is 0', () => {
    expect(isEligibleForRedemption(1, 0)).toBe(true)
  })

  it('returns false for zero points and zero minRedeemable', () => {
    expect(isEligibleForRedemption(0, 0)).toBe(false)
  })
})
