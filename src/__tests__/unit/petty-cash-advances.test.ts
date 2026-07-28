import { describe, it, expect } from 'vitest'
import {
  calcBalanceAfterTx,
  isValidAdvanceTransition,
  calcReplenishAmount,
  aggregateAdvancesByCategory,
  findUnsettledAdvances,
  totalUnsettledAmount,
} from '@/lib/petty-cash'
import type { AdvanceTransaction, AdvanceStatus, AdvanceTransactionType } from '@/lib/petty-cash'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeAdv(overrides: Partial<AdvanceTransaction> = {}): AdvanceTransaction {
  return {
    id: 'tx-1',
    fundId: 'fund-1',
    storeId: 'store-1',
    type: 'ADVANCE',
    amount: 150000,
    balance: 850000,
    description: 'Transport ke supplier',
    category: 'Transportasi',
    receiptNo: '',
    requestedBy: 'staff-a',
    approvedBy: '',
    status: 'PENDING',
    createdAt: '2024-07-10T08:00:00.000Z',
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Petty Cash Advances', () => {

  describe('Balance after transaction', () => {
    it('REPLENISH increases balance', () => {
      expect(calcBalanceAfterTx(500000, 'REPLENISH', 300000)).toBe(800000)
    })

    it('EXPENSE decreases balance', () => {
      expect(calcBalanceAfterTx(500000, 'EXPENSE', 75000)).toBe(425000)
    })

    it('ADVANCE decreases balance', () => {
      expect(calcBalanceAfterTx(500000, 'ADVANCE', 100000)).toBe(400000)
    })

    it('SETTLEMENT decreases balance (receipt reconciliation)', () => {
      expect(calcBalanceAfterTx(500000, 'SETTLEMENT', 50000)).toBe(450000)
    })
  })

  describe('Advance status transitions', () => {
    it('PENDING → APPROVED is valid', () => {
      expect(isValidAdvanceTransition('PENDING', 'APPROVED')).toBe(true)
    })

    it('PENDING → REJECTED is valid', () => {
      expect(isValidAdvanceTransition('PENDING', 'REJECTED')).toBe(true)
    })

    it('APPROVED → SETTLED is valid', () => {
      expect(isValidAdvanceTransition('APPROVED', 'SETTLED')).toBe(true)
    })

    it('APPROVED → REJECTED is valid (cancel after approval)', () => {
      expect(isValidAdvanceTransition('APPROVED', 'REJECTED')).toBe(true)
    })

    it('SETTLED → APPROVED is invalid', () => {
      expect(isValidAdvanceTransition('SETTLED', 'APPROVED')).toBe(false)
    })

    it('REJECTED → APPROVED is invalid', () => {
      expect(isValidAdvanceTransition('REJECTED', 'APPROVED')).toBe(false)
    })
  })

  describe('Replenishment calculation', () => {
    it('returns top-up needed when balance is below replenishAmount', () => {
      expect(calcReplenishAmount(200000, 1000000)).toBe(800000)
    })

    it('returns 0 when balance already meets or exceeds replenishAmount', () => {
      expect(calcReplenishAmount(1000000, 1000000)).toBe(0)
      expect(calcReplenishAmount(1200000, 1000000)).toBe(0)
    })
  })

  describe('Category aggregation', () => {
    it('aggregates EXPENSE and ADVANCE by category', () => {
      const txs: AdvanceTransaction[] = [
        makeAdv({ id: 't1', type: 'EXPENSE',   amount: 50000,  category: 'ATK' }),
        makeAdv({ id: 't2', type: 'ADVANCE',   amount: 100000, category: 'ATK' }),
        makeAdv({ id: 't3', type: 'REPLENISH', amount: 500000, category: 'ATK' }),
        makeAdv({ id: 't4', type: 'EXPENSE',   amount: 30000,  category: 'Konsumsi' }),
      ]
      const summary = aggregateAdvancesByCategory(txs)
      const atk = summary.find(s => s.category === 'ATK')
      expect(atk?.total).toBe(150000) // 50k + 100k
      expect(atk?.count).toBe(2)
    })

    it('excludes REPLENISH and SETTLEMENT from category totals', () => {
      const txs: AdvanceTransaction[] = [
        makeAdv({ id: 't1', type: 'REPLENISH',  amount: 500000, category: 'Modal' }),
        makeAdv({ id: 't2', type: 'SETTLEMENT', amount: 80000,  category: 'Lain-lain' }),
      ]
      const summary = aggregateAdvancesByCategory(txs)
      expect(summary).toHaveLength(0)
    })
  })

  describe('Unsettled advance detection', () => {
    it('detects PENDING advances as unsettled', () => {
      const txs = [
        makeAdv({ id: 't1', status: 'PENDING' }),
        makeAdv({ id: 't2', status: 'APPROVED' }),
        makeAdv({ id: 't3', status: 'SETTLED' }),
        makeAdv({ id: 't4', status: 'REJECTED' }),
      ]
      const unsettled = findUnsettledAdvances(txs)
      expect(unsettled).toHaveLength(2)
      expect(unsettled.map(u => u.id)).toEqual(['t1', 't2'])
    })

    it('totalUnsettledAmount sums only PENDING and APPROVED advances', () => {
      const txs = [
        makeAdv({ id: 't1', amount: 100000, status: 'PENDING' }),
        makeAdv({ id: 't2', amount: 200000, status: 'APPROVED' }),
        makeAdv({ id: 't3', amount: 50000,  status: 'SETTLED' }),
        makeAdv({ id: 't4', amount: 75000,  status: 'REJECTED' }),
      ]
      expect(totalUnsettledAmount(txs)).toBe(300000)
    })
  })
})
