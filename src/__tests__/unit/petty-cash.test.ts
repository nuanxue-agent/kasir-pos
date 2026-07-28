import { describe, it, expect } from 'vitest'
import {
  calcBalanceAfterExpense,
  calcBalanceAfterReplenishment,
  calcReplenishmentNeeded,
  wouldExceedBalance,
  wouldExceedMax,
  isBelowLowBalanceThreshold,
  aggregateByCategory,
  filterByMonth,
  totalExpenses,
  totalReplenishments,
} from '@/lib/petty-cash'
import type { PettyCashTransaction } from '@/lib/petty-cash'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeTx(overrides: Partial<PettyCashTransaction> = {}): PettyCashTransaction {
  return {
    id: 'tx-1',
    fundId: 'fund-1',
    storeId: 'store-1',
    type: 'EXPENSE',
    amount: 50000,
    category: 'ATK',
    description: 'Beli kertas',
    receiptNumber: '',
    createdBy: 'admin',
    createdAt: '2024-06-15T10:00:00.000Z',
    ...overrides,
  }
}

const sampleTransactions: PettyCashTransaction[] = [
  makeTx({ id: 'tx-1', amount: 50000,  category: 'ATK',         createdAt: '2024-06-01T08:00:00Z' }),
  makeTx({ id: 'tx-2', amount: 30000,  category: 'Transportasi', createdAt: '2024-06-05T09:00:00Z' }),
  makeTx({ id: 'tx-3', amount: 20000,  category: 'ATK',          createdAt: '2024-06-10T10:00:00Z' }),
  makeTx({ id: 'tx-4', amount: 15000,  category: 'Konsumsi',     createdAt: '2024-06-12T11:00:00Z' }),
  makeTx({ id: 'tx-5', amount: 200000, category: 'Replenishment', type: 'REPLENISHMENT', createdAt: '2024-06-15T12:00:00Z' }),
  makeTx({ id: 'tx-6', amount: 45000,  category: 'Utilitas',     createdAt: '2024-07-03T08:00:00Z' }),
]

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Petty Cash', () => {

  describe('Balance after expense', () => {
    it('deducts the expense amount from current balance', () => {
      expect(calcBalanceAfterExpense(500000, 50000)).toBe(450000)
    })

    it('returns zero when expense equals balance', () => {
      expect(calcBalanceAfterExpense(100000, 100000)).toBe(0)
    })

    it('returns negative when expense exceeds balance (caller must guard)', () => {
      expect(calcBalanceAfterExpense(50000, 80000)).toBe(-30000)
    })

    it('wouldExceedBalance detects when expense is too large', () => {
      expect(wouldExceedBalance(100000, 150000)).toBe(true)
      expect(wouldExceedBalance(100000, 100000)).toBe(false)
      expect(wouldExceedBalance(100000, 99999)).toBe(false)
    })
  })

  describe('Replenishment logic', () => {
    it('adds replenishment amount to balance', () => {
      expect(calcBalanceAfterReplenishment(200000, 300000, 1000000)).toBe(500000)
    })

    it('caps balance at maxBalance', () => {
      expect(calcBalanceAfterReplenishment(800000, 500000, 1000000)).toBe(1000000)
    })

    it('replenishment exactly to max is allowed', () => {
      expect(calcBalanceAfterReplenishment(500000, 500000, 1000000)).toBe(1000000)
    })
  })

  describe('Max balance enforcement', () => {
    it('calcReplenishmentNeeded returns gap to max', () => {
      expect(calcReplenishmentNeeded(300000, 1000000)).toBe(700000)
    })

    it('calcReplenishmentNeeded returns 0 when already at max', () => {
      expect(calcReplenishmentNeeded(1000000, 1000000)).toBe(0)
    })

    it('wouldExceedMax detects overflow', () => {
      expect(wouldExceedMax(800000, 300000, 1000000)).toBe(true)
      expect(wouldExceedMax(500000, 500000, 1000000)).toBe(false)
    })
  })

  describe('Category aggregation', () => {
    it('sums expenses by category, ignoring replenishments', () => {
      const summary = aggregateByCategory(sampleTransactions)
      const atk = summary.find(s => s.category === 'ATK')
      expect(atk?.total).toBe(70000)   // 50000 + 20000
      expect(atk?.count).toBe(2)
    })

    it('sorts categories by total descending', () => {
      const summary = aggregateByCategory(sampleTransactions)
      // ATK=70000 is highest among June expenses visible in all months
      for (let i = 0; i < summary.length - 1; i++) {
        expect(summary[i].total).toBeGreaterThanOrEqual(summary[i + 1].total)
      }
    })

    it('excludes REPLENISHMENT transactions from category totals', () => {
      const summary = aggregateByCategory(sampleTransactions)
      const replenishment = summary.find(s => s.category === 'Replenishment')
      expect(replenishment).toBeUndefined()
    })

    it('totalExpenses sums only EXPENSE type', () => {
      expect(totalExpenses(sampleTransactions)).toBe(50000 + 30000 + 20000 + 15000 + 45000)
    })

    it('totalReplenishments sums only REPLENISHMENT type', () => {
      expect(totalReplenishments(sampleTransactions)).toBe(200000)
    })
  })

  describe('Monthly filter', () => {
    it('filterByMonth returns only transactions in that month', () => {
      const june = filterByMonth(sampleTransactions, '2024-06')
      expect(june).toHaveLength(5)
    })

    it('filterByMonth excludes other months', () => {
      const july = filterByMonth(sampleTransactions, '2024-07')
      expect(july).toHaveLength(1)
      expect(july[0].id).toBe('tx-6')
    })
  })

  describe('Low balance alert threshold', () => {
    it('flags balance below 20% of max as low', () => {
      expect(isBelowLowBalanceThreshold(150000, 1000000)).toBe(true)  // 15%
    })

    it('does not flag balance at exactly 20% threshold', () => {
      expect(isBelowLowBalanceThreshold(200000, 1000000)).toBe(false) // 20%
    })

    it('does not flag healthy balance', () => {
      expect(isBelowLowBalanceThreshold(500000, 1000000)).toBe(false) // 50%
    })

    it('respects custom threshold percentage', () => {
      expect(isBelowLowBalanceThreshold(250000, 1000000, 0.3)).toBe(true)  // 25% < 30%
      expect(isBelowLowBalanceThreshold(350000, 1000000, 0.3)).toBe(false) // 35% > 30%
    })

    it('returns false when maxBalance is zero to avoid division by zero', () => {
      expect(isBelowLowBalanceThreshold(0, 0)).toBe(false)
    })
  })
})
