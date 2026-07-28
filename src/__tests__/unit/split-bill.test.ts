import { describe, it, expect } from 'vitest'
import {
  calcEqualSplit,
  validateCustomSplit,
  calcRemainingBalance,
  deriveSplitStatus,
  aggregateGroupItems,
} from '@/components/pos/SplitBillClient'
import type { SplitBillPayer, GroupOrderItem } from '@/components/pos/SplitBillClient'

// ─── Equal split calculation ──────────────────────────────────────────────────

describe('calcEqualSplit', () => {
  it('divides total evenly among 3 payers', () => {
    const result = calcEqualSplit(300000, 3)
    expect(result).toHaveLength(3)
    expect(result.every(a => a === 100000)).toBe(true)
  })

  it('puts remainder on last payer when total is not divisible', () => {
    const result = calcEqualSplit(100001, 3)
    expect(result[0]).toBe(33333)
    expect(result[1]).toBe(33333)
    expect(result[2]).toBe(33335)
    expect(result.reduce((a, b) => a + b, 0)).toBe(100001)
  })

  it('returns empty array for count <= 0', () => {
    expect(calcEqualSplit(50000, 0)).toEqual([])
    expect(calcEqualSplit(50000, -1)).toEqual([])
  })

  it('returns single element array for count = 1', () => {
    const result = calcEqualSplit(75000, 1)
    expect(result).toHaveLength(1)
    expect(result[0]).toBe(75000)
  })
})

// ─── Custom split validation ──────────────────────────────────────────────────

describe('validateCustomSplit', () => {
  it('returns null when amounts sum exactly to total', () => {
    expect(validateCustomSplit([50000, 50000], 100000)).toBeNull()
  })

  it('returns null when amounts sum within 1 IDR tolerance', () => {
    // rounding allowance
    expect(validateCustomSplit([33333, 33333, 33334], 100000)).toBeNull()
  })

  it('returns error when amounts are below total', () => {
    const err = validateCustomSplit([40000, 40000], 100000)
    expect(err).not.toBeNull()
    expect(err).toContain('harus sama dengan total')
  })

  it('returns error when amounts exceed total', () => {
    const err = validateCustomSplit([60000, 60000], 100000)
    expect(err).not.toBeNull()
  })

  it('returns error for empty amounts array', () => {
    expect(validateCustomSplit([], 100000)).toBe('Minimal 1 pembayar')
  })
})

// ─── Partial payment tracking & remaining balance ─────────────────────────────

describe('calcRemainingBalance', () => {
  const payers: SplitBillPayer[] = [
    { id: '1', name: 'Alice', amount: 50000, paid: true,  paidAt: '2024-01-01', paymentMethod: 'Cash' },
    { id: '2', name: 'Bob',   amount: 30000, paid: false, paidAt: null,         paymentMethod: null  },
    { id: '3', name: 'Carol', amount: 20000, paid: false, paidAt: null,         paymentMethod: null  },
  ]

  it('sums unpaid payer amounts correctly', () => {
    expect(calcRemainingBalance(payers)).toBe(50000)
  })

  it('returns 0 when all payers have paid', () => {
    const allPaid = payers.map(p => ({ ...p, paid: true }))
    expect(calcRemainingBalance(allPaid)).toBe(0)
  })

  it('returns full total when no one has paid', () => {
    const nonePaid = payers.map(p => ({ ...p, paid: false }))
    expect(calcRemainingBalance(nonePaid)).toBe(100000)
  })
})

// ─── Derive split status ──────────────────────────────────────────────────────

describe('deriveSplitStatus', () => {
  it('returns PAID when all payers paid', () => {
    const payers: SplitBillPayer[] = [
      { id: '1', name: 'A', amount: 50000, paid: true,  paidAt: null, paymentMethod: null },
      { id: '2', name: 'B', amount: 50000, paid: true,  paidAt: null, paymentMethod: null },
    ]
    expect(deriveSplitStatus(payers)).toBe('PAID')
  })

  it('returns PARTIAL when some payers paid', () => {
    const payers: SplitBillPayer[] = [
      { id: '1', name: 'A', amount: 50000, paid: true,  paidAt: null, paymentMethod: null },
      { id: '2', name: 'B', amount: 50000, paid: false, paidAt: null, paymentMethod: null },
    ]
    expect(deriveSplitStatus(payers)).toBe('PARTIAL')
  })

  it('returns PENDING when no payers paid', () => {
    const payers: SplitBillPayer[] = [
      { id: '1', name: 'A', amount: 50000, paid: false, paidAt: null, paymentMethod: null },
    ]
    expect(deriveSplitStatus(payers)).toBe('PENDING')
  })
})

// ─── Group order item aggregation ─────────────────────────────────────────────

describe('aggregateGroupItems', () => {
  const items: GroupOrderItem[] = [
    { id: 'i1', productId: 'p1', name: 'Nasi Goreng', price: 25000, qty: 1, addedBy: 'Alice' },
    { id: 'i2', productId: 'p2', name: 'Es Teh',      price: 8000,  qty: 2, addedBy: 'Bob'   },
    { id: 'i3', productId: 'p1', name: 'Nasi Goreng', price: 25000, qty: 2, addedBy: 'Carol' },
  ]

  it('merges duplicate productIds by summing qty', () => {
    const result = aggregateGroupItems(items)
    const nasiGoreng = result.find(i => i.productId === 'p1')
    expect(nasiGoreng?.qty).toBe(3)
  })

  it('keeps unique products unchanged', () => {
    const result = aggregateGroupItems(items)
    const esTeh = result.find(i => i.productId === 'p2')
    expect(esTeh?.qty).toBe(2)
  })

  it('returns correct number of unique products', () => {
    const result = aggregateGroupItems(items)
    expect(result).toHaveLength(2)
  })

  it('handles empty items array', () => {
    expect(aggregateGroupItems([])).toEqual([])
  })
})
