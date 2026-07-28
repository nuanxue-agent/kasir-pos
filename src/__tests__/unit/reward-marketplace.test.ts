import { describe, it, expect } from 'vitest'
import {
  hasEnoughPoints,
  calcPointsAfterRedemption,
  calcStockAfterRedemption,
  isValidRedemptionTransition,
  aggregateRedemptionHistory,
} from '@/components/crm/RewardMarketplaceClient'

type RedemptionStatus = 'PENDING' | 'FULFILLED' | 'CANCELLED'

function makeRedemption(overrides: Partial<{
  id: string
  customerId: string
  storeId: string
  rewardItemId: string
  pointsSpent: number
  status: RedemptionStatus
  createdAt: string
}> = {}) {
  return {
    id: 'r1',
    customerId: 'c1',
    storeId: 's1',
    rewardItemId: 'ri1',
    pointsSpent: 100,
    status: 'PENDING' as RedemptionStatus,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('Reward Marketplace — business logic', () => {
  // ── Points sufficiency ───────────────────────────────────────────────────

  describe('hasEnoughPoints', () => {
    it('returns true when customer has exactly enough points', () => {
      expect(hasEnoughPoints(500, 500)).toBe(true)
    })

    it('returns true when customer has more than enough points', () => {
      expect(hasEnoughPoints(1000, 300)).toBe(true)
    })

    it('returns false when customer has insufficient points', () => {
      expect(hasEnoughPoints(200, 500)).toBe(false)
    })

    it('returns false when customer has zero points and cost is positive', () => {
      expect(hasEnoughPoints(0, 100)).toBe(false)
    })
  })

  // ── Points deduction ─────────────────────────────────────────────────────

  describe('calcPointsAfterRedemption', () => {
    it('deducts points correctly after redemption', () => {
      expect(calcPointsAfterRedemption(1000, 300)).toBe(700)
    })

    it('returns 0 when points exactly match the cost', () => {
      expect(calcPointsAfterRedemption(500, 500)).toBe(0)
    })

    it('does not deduct when customer has insufficient points', () => {
      expect(calcPointsAfterRedemption(100, 500)).toBe(100)
    })
  })

  // ── Stock decrement ──────────────────────────────────────────────────────

  describe('calcStockAfterRedemption', () => {
    it('decrements stock by 1 on redemption', () => {
      expect(calcStockAfterRedemption(10)).toBe(9)
    })

    it('does not go below zero when stock is already 0', () => {
      expect(calcStockAfterRedemption(0)).toBe(0)
    })

    it('correctly handles stock of 1 (last item)', () => {
      expect(calcStockAfterRedemption(1)).toBe(0)
    })
  })

  // ── Status transitions ───────────────────────────────────────────────────

  describe('isValidRedemptionTransition', () => {
    it('allows PENDING → FULFILLED', () => {
      expect(isValidRedemptionTransition('PENDING', 'FULFILLED')).toBe(true)
    })

    it('allows PENDING → CANCELLED', () => {
      expect(isValidRedemptionTransition('PENDING', 'CANCELLED')).toBe(true)
    })

    it('blocks FULFILLED → CANCELLED (terminal state)', () => {
      expect(isValidRedemptionTransition('FULFILLED', 'CANCELLED')).toBe(false)
    })

    it('blocks CANCELLED → FULFILLED (terminal state)', () => {
      expect(isValidRedemptionTransition('CANCELLED', 'FULFILLED')).toBe(false)
    })

    it('blocks FULFILLED → PENDING (no going back)', () => {
      expect(isValidRedemptionTransition('FULFILLED', 'PENDING')).toBe(false)
    })
  })

  // ── Redemption history aggregation ───────────────────────────────────────

  describe('aggregateRedemptionHistory', () => {
    it('returns zero counts for empty history', () => {
      const result = aggregateRedemptionHistory([])
      expect(result).toEqual({ total: 0, totalPoints: 0, pending: 0, fulfilled: 0, cancelled: 0 })
    })

    it('correctly aggregates counts across all statuses', () => {
      const redemptions = [
        makeRedemption({ status: 'PENDING',   pointsSpent: 100 }),
        makeRedemption({ status: 'FULFILLED', pointsSpent: 200 }),
        makeRedemption({ status: 'CANCELLED', pointsSpent: 150 }),
      ]
      const result = aggregateRedemptionHistory(redemptions)
      expect(result.total).toBe(3)
      expect(result.pending).toBe(1)
      expect(result.fulfilled).toBe(1)
      expect(result.cancelled).toBe(1)
    })

    it('does not count cancelled redemption points in totalPoints', () => {
      const redemptions = [
        makeRedemption({ status: 'FULFILLED', pointsSpent: 300 }),
        makeRedemption({ status: 'CANCELLED', pointsSpent: 500 }),
      ]
      const result = aggregateRedemptionHistory(redemptions)
      // Only FULFILLED counted — CANCELLED points were refunded
      expect(result.totalPoints).toBe(300)
    })

    it('sums totalPoints for PENDING and FULFILLED only', () => {
      const redemptions = [
        makeRedemption({ status: 'PENDING',   pointsSpent: 100 }),
        makeRedemption({ status: 'FULFILLED', pointsSpent: 200 }),
        makeRedemption({ status: 'CANCELLED', pointsSpent: 999 }),
      ]
      const result = aggregateRedemptionHistory(redemptions)
      expect(result.totalPoints).toBe(300)
    })
  })
})
