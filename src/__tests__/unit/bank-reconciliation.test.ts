import { describe, it, expect } from 'vitest'
import {
  parseBankCSV,
  calcReconciliationStats,
  validateTxType,
  type BankTransaction,
  type ImportedRow,
} from '@/components/accounting/BankReconciliationClient'

// ─── Auto-match algorithm helpers (inline for unit testing) ──────────────────

interface MatchCandidate {
  id: string
  date: string
  amount: number
  type: string
}

function autoMatchAlgo(
  bankTxs: Array<{ id: string; date: string; amount: number; type: string }>,
  orders: MatchCandidate[],
  toleranceDays = 1,
  toleranceAmount = 0.01,
): Array<{ txId: string; orderId: string }> {
  const matches: Array<{ txId: string; orderId: string }> = []
  const usedOrderIds = new Set<string>()

  for (const tx of bankTxs) {
    const txDate = new Date(tx.date).getTime()
    for (const order of orders) {
      if (usedOrderIds.has(order.id)) continue
      if (Math.abs(order.amount - tx.amount) > toleranceAmount) continue
      const orderDate = new Date(order.date).getTime()
      const diffDays = Math.abs(txDate - orderDate) / (1000 * 60 * 60 * 24)
      if (diffDays <= toleranceDays) {
        matches.push({ txId: tx.id, orderId: order.id })
        usedOrderIds.add(order.id)
        break
      }
    }
  }
  return matches
}

function calcBalanceDiff(transactions: BankTransaction[]): number {
  return transactions.reduce((s, t) => s + (t.type === 'CREDIT' ? t.amount : -t.amount), 0)
}

function countUnmatched(transactions: BankTransaction[]): number {
  return transactions.filter(t => t.status === 'UNMATCHED').length
}

function calcMatchedPct(transactions: BankTransaction[]): number {
  if (transactions.length === 0) return 0
  const matched = transactions.filter(t => t.status !== 'UNMATCHED').length
  return Math.round((matched / transactions.length) * 100)
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeTx(overrides: Partial<BankTransaction> = {}): BankTransaction {
  return {
    id: 'tx1',
    bankAccountId: 'acc1',
    storeId: 'store1',
    date: '2025-01-15',
    description: 'Payment received',
    amount: 100000,
    type: 'CREDIT',
    reference: null,
    matchedOrderId: null,
    matchedJournalId: null,
    status: 'UNMATCHED',
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Auto-match algorithm', () => {
  it('matches by exact amount and same date', () => {
    const txs = [{ id: 'tx1', date: '2025-01-15', amount: 150000, type: 'CREDIT' }]
    const orders = [{ id: 'ord1', date: '2025-01-15', amount: 150000, type: 'CREDIT' }]
    const result = autoMatchAlgo(txs, orders)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ txId: 'tx1', orderId: 'ord1' })
  })

  it('matches within 1-day date tolerance', () => {
    const txs = [{ id: 'tx1', date: '2025-01-16', amount: 75000, type: 'CREDIT' }]
    const orders = [{ id: 'ord1', date: '2025-01-15', amount: 75000, type: 'CREDIT' }]
    const result = autoMatchAlgo(txs, orders)
    expect(result).toHaveLength(1)
  })

  it('does not match when date difference > 1 day', () => {
    const txs = [{ id: 'tx1', date: '2025-01-18', amount: 75000, type: 'CREDIT' }]
    const orders = [{ id: 'ord1', date: '2025-01-15', amount: 75000, type: 'CREDIT' }]
    const result = autoMatchAlgo(txs, orders)
    expect(result).toHaveLength(0)
  })

  it('does not match when amount differs beyond tolerance', () => {
    const txs = [{ id: 'tx1', date: '2025-01-15', amount: 100000, type: 'CREDIT' }]
    const orders = [{ id: 'ord1', date: '2025-01-15', amount: 99000, type: 'CREDIT' }]
    const result = autoMatchAlgo(txs, orders)
    expect(result).toHaveLength(0)
  })

  it('does not reuse the same order for two transactions', () => {
    const txs = [
      { id: 'tx1', date: '2025-01-15', amount: 50000, type: 'CREDIT' },
      { id: 'tx2', date: '2025-01-15', amount: 50000, type: 'CREDIT' },
    ]
    const orders = [{ id: 'ord1', date: '2025-01-15', amount: 50000, type: 'CREDIT' }]
    const result = autoMatchAlgo(txs, orders)
    expect(result).toHaveLength(1)
  })
})

describe('Reconciliation percentage calculation', () => {
  it('returns 0% when all transactions are unmatched', () => {
    const txs = [makeTx({ status: 'UNMATCHED' }), makeTx({ id: 'tx2', status: 'UNMATCHED' })]
    expect(calcMatchedPct(txs)).toBe(0)
  })

  it('returns 100% when all transactions are matched', () => {
    const txs = [makeTx({ status: 'MATCHED' }), makeTx({ id: 'tx2', status: 'MANUAL' })]
    expect(calcMatchedPct(txs)).toBe(100)
  })

  it('returns 0% for empty transaction list', () => {
    expect(calcMatchedPct([])).toBe(0)
  })

  it('calculates correct percentage for mixed statuses', () => {
    const txs = [
      makeTx({ id: 'tx1', status: 'MATCHED' }),
      makeTx({ id: 'tx2', status: 'UNMATCHED' }),
      makeTx({ id: 'tx3', status: 'UNMATCHED' }),
      makeTx({ id: 'tx4', status: 'MANUAL' }),
    ]
    expect(calcMatchedPct(txs)).toBe(50)
  })
})

describe('Balance difference computation', () => {
  it('returns positive value when credits exceed debits', () => {
    const txs = [
      makeTx({ id: 'tx1', amount: 200000, type: 'CREDIT' }),
      makeTx({ id: 'tx2', amount: 50000, type: 'DEBIT' }),
    ]
    expect(calcBalanceDiff(txs)).toBe(150000)
  })

  it('returns negative value when debits exceed credits', () => {
    const txs = [
      makeTx({ id: 'tx1', amount: 50000, type: 'CREDIT' }),
      makeTx({ id: 'tx2', amount: 200000, type: 'DEBIT' }),
    ]
    expect(calcBalanceDiff(txs)).toBe(-150000)
  })

  it('returns zero for empty list', () => {
    expect(calcBalanceDiff([])).toBe(0)
  })
})

describe('Transaction type validation', () => {
  it('accepts CREDIT as valid type', () => {
    expect(validateTxType('CREDIT')).toBe(true)
  })

  it('accepts DEBIT as valid type', () => {
    expect(validateTxType('DEBIT')).toBe(true)
  })

  it('rejects invalid type strings', () => {
    expect(validateTxType('TRANSFER')).toBe(false)
    expect(validateTxType('credit')).toBe(false)
    expect(validateTxType('')).toBe(false)
  })
})

describe('Unmatched count', () => {
  it('counts only UNMATCHED transactions', () => {
    const txs = [
      makeTx({ id: 'tx1', status: 'UNMATCHED' }),
      makeTx({ id: 'tx2', status: 'MATCHED' }),
      makeTx({ id: 'tx3', status: 'UNMATCHED' }),
      makeTx({ id: 'tx4', status: 'MANUAL' }),
    ]
    expect(countUnmatched(txs)).toBe(2)
  })
})

describe('calcReconciliationStats', () => {
  it('computes all stats correctly from a mixed transaction set', () => {
    const txs = [
      makeTx({ id: 'tx1', status: 'MATCHED', amount: 100000, type: 'CREDIT' }),
      makeTx({ id: 'tx2', status: 'UNMATCHED', amount: 50000, type: 'DEBIT' }),
      makeTx({ id: 'tx3', status: 'MANUAL', amount: 30000, type: 'CREDIT' }),
    ]
    const stats = calcReconciliationStats(txs)
    expect(stats.total).toBe(3)
    expect(stats.matched).toBe(2)
    expect(stats.unmatched).toBe(1)
    expect(stats.matchedPct).toBe(67)
    expect(stats.creditTotal).toBe(130000)
    expect(stats.debitTotal).toBe(50000)
    expect(stats.balanceDiff).toBe(80000)
  })
})
