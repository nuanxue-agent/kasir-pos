import { describe, it, expect } from 'vitest'
import {
  hasEnoughPoints,
  isStockAvailable,
  isRewardExpired,
  calcDiscountValue,
  isValidTransition,
  pointsAfterRedemption,
  resolveRewardLabel,
} from '@/components/crm/RewardRedemptionClient'

// ─── Points sufficiency ───────────────────────────────────────────────────────

describe('hasEnoughPoints', () => {
  it('returns true when balance equals cost', () => {
    expect(hasEnoughPoints(500, 500)).toBe(true)
  })

  it('returns true when balance exceeds cost', () => {
    expect(hasEnoughPoints(1000, 300)).toBe(true)
  })

  it('returns false when balance is less than cost', () => {
    expect(hasEnoughPoints(200, 500)).toBe(false)
  })
})

// ─── Stock availability ───────────────────────────────────────────────────────

describe('isStockAvailable', () => {
  it('returns true for unlimited stock (-1)', () => {
    expect(isStockAvailable(-1)).toBe(true)
  })

  it('returns true when stock is positive', () => {
    expect(isStockAvailable(10)).toBe(true)
  })

  it('returns false when stock is zero', () => {
    expect(isStockAvailable(0)).toBe(false)
  })
})

// ─── Redemption value calculation ────────────────────────────────────────────

describe('calcDiscountValue', () => {
  it('returns reward value when order total is higher', () => {
    expect(calcDiscountValue(10000, 50000)).toBe(10000)
  })

  it('caps discount at order total', () => {
    expect(calcDiscountValue(50000, 20000)).toBe(20000)
  })

  it('returns exact match when equal', () => {
    expect(calcDiscountValue(15000, 15000)).toBe(15000)
  })
})

// ─── Status transition validation ────────────────────────────────────────────

describe('isValidTransition', () => {
  it('allows PENDING -> FULFILLED', () => {
    expect(isValidTransition('PENDING', 'FULFILLED')).toBe(true)
  })

  it('allows PENDING -> CANCELLED', () => {
    expect(isValidTransition('PENDING', 'CANCELLED')).toBe(true)
  })

  it('rejects FULFILLED -> CANCELLED', () => {
    expect(isValidTransition('FULFILLED', 'CANCELLED')).toBe(false)
  })

  it('rejects CANCELLED -> FULFILLED', () => {
    expect(isValidTransition('CANCELLED', 'FULFILLED')).toBe(false)
  })
})

// ─── Expiry detection ────────────────────────────────────────────────────────

describe('isRewardExpired', () => {
  it('returns false when expiresAt is null', () => {
    expect(isRewardExpired(null)).toBe(false)
  })

  it('returns true when reward is in the past', () => {
    expect(isRewardExpired('2020-01-01T00:00:00Z')).toBe(true)
  })

  it('returns false when reward is in the future', () => {
    expect(isRewardExpired('2099-12-31T23:59:59Z')).toBe(false)
  })
})

// ─── Points deduction ────────────────────────────────────────────────────────

describe('pointsAfterRedemption', () => {
  it('deducts points correctly', () => {
    expect(pointsAfterRedemption(1000, 300)).toBe(700)
  })

  it('throws when balance is insufficient', () => {
    expect(() => pointsAfterRedemption(100, 500)).toThrow('Insufficient points')
  })
})
