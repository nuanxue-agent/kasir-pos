import { describe, it, expect } from 'vitest'
import {
  hasSufficientBalance,
  isAboveMinTransfer,
  isWithinDailyLimit,
  calcNetBalance,
  isValidTransferStatusTransition,
  aggregateTransferStats,
  type TransferStatus,
  type PointsTransfer,
} from '@/components/crm/PointsTransferClient'

function makeTransfer(overrides: Partial<PointsTransfer> = {}): PointsTransfer {
  return {
    id: 't1',
    storeId: 's1',
    fromCustomerId: 'c1',
    toCustomerId: 'c2',
    points: 100,
    message: null,
    status: 'COMPLETED' as TransferStatus,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('Points Transfer — business logic', () => {
  // ── Sufficient balance ─────────────────────────────────────────────────────

  describe('hasSufficientBalance', () => {
    it('returns true when balance equals the transfer amount', () => {
      expect(hasSufficientBalance(500, 500)).toBe(true)
    })

    it('returns true when balance exceeds the transfer amount', () => {
      expect(hasSufficientBalance(1000, 300)).toBe(true)
    })

    it('returns false when balance is less than the transfer amount', () => {
      expect(hasSufficientBalance(200, 500)).toBe(false)
    })

    it('returns false when balance is zero and amount is positive', () => {
      expect(hasSufficientBalance(0, 50)).toBe(false)
    })
  })

  // ── Daily limit ────────────────────────────────────────────────────────────

  describe('isWithinDailyLimit', () => {
    it('allows transfer when used + new amount is exactly at limit', () => {
      expect(isWithinDailyLimit(500, 500, 1000)).toBe(true)
    })

    it('allows transfer when used + new amount is below limit', () => {
      expect(isWithinDailyLimit(200, 300, 1000)).toBe(true)
    })

    it('blocks transfer when used + new amount exceeds limit', () => {
      expect(isWithinDailyLimit(900, 200, 1000)).toBe(false)
    })

    it('blocks transfer when already at limit (used = dailyLimit)', () => {
      expect(isWithinDailyLimit(1000, 1, 1000)).toBe(false)
    })
  })

  // ── Minimum transfer amount ────────────────────────────────────────────────

  describe('isAboveMinTransfer', () => {
    it('returns true when amount equals minimum', () => {
      expect(isAboveMinTransfer(10, 10)).toBe(true)
    })

    it('returns true when amount exceeds minimum', () => {
      expect(isAboveMinTransfer(100, 10)).toBe(true)
    })

    it('returns false when amount is below minimum', () => {
      expect(isAboveMinTransfer(5, 10)).toBe(false)
    })
  })

  // ── Status transitions ────────────────────────────────────────────────────

  describe('isValidTransferStatusTransition', () => {
    it('allows PENDING → CANCELLED', () => {
      expect(isValidTransferStatusTransition('PENDING', 'CANCELLED')).toBe(true)
    })

    it('allows PENDING → COMPLETED', () => {
      expect(isValidTransferStatusTransition('PENDING', 'COMPLETED')).toBe(true)
    })

    it('blocks COMPLETED → CANCELLED (terminal state)', () => {
      expect(isValidTransferStatusTransition('COMPLETED', 'CANCELLED')).toBe(false)
    })

    it('blocks CANCELLED → COMPLETED (terminal state)', () => {
      expect(isValidTransferStatusTransition('CANCELLED', 'COMPLETED')).toBe(false)
    })

    it('blocks COMPLETED → PENDING (no going back)', () => {
      expect(isValidTransferStatusTransition('COMPLETED', 'PENDING')).toBe(false)
    })
  })

  // ── Net balance after transfer ─────────────────────────────────────────────

  describe('calcNetBalance', () => {
    it('deducts sent points and adds received points', () => {
      expect(calcNetBalance(1000, 300, 150)).toBe(850)
    })

    it('returns original balance when no transfers have occurred', () => {
      expect(calcNetBalance(500, 0, 0)).toBe(500)
    })

    it('returns zero when balance equals sent points with no received', () => {
      expect(calcNetBalance(200, 200, 0)).toBe(0)
    })

    it('increases balance when only receiving points', () => {
      expect(calcNetBalance(100, 0, 200)).toBe(300)
    })
  })

  // ── Aggregate transfer stats ──────────────────────────────────────────────

  describe('aggregateTransferStats', () => {
    it('returns zero counts for empty history', () => {
      const result = aggregateTransferStats([], 'c1')
      expect(result).toEqual({ totalSent: 0, totalReceived: 0, pending: 0, completed: 0, cancelled: 0, total: 0 })
    })

    it('correctly counts sent and received points for a customer', () => {
      const transfers = [
        makeTransfer({ fromCustomerId: 'c1', toCustomerId: 'c2', points: 200, status: 'COMPLETED' }),
        makeTransfer({ fromCustomerId: 'c2', toCustomerId: 'c1', points: 50,  status: 'COMPLETED' }),
      ]
      const result = aggregateTransferStats(transfers, 'c1')
      expect(result.totalSent).toBe(200)
      expect(result.totalReceived).toBe(50)
    })

    it('does not count cancelled transfers in totalSent/totalReceived', () => {
      const transfers = [
        makeTransfer({ fromCustomerId: 'c1', points: 500, status: 'CANCELLED' }),
        makeTransfer({ fromCustomerId: 'c1', points: 100, status: 'COMPLETED' }),
      ]
      const result = aggregateTransferStats(transfers, 'c1')
      expect(result.totalSent).toBe(100)
      expect(result.cancelled).toBe(1)
    })
  })
})
