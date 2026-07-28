import { describe, it, expect } from 'vitest'
import {
  calcReturnTotal,
  validateRefundMethod,
  isStatusTransitionAllowed,
  buildStockRestorations,
  calcPartialReturnTotal,
} from '@/components/pos/ReturnClient'
import type { ReturnStatus, RefundMethod, OrderLine } from '@/components/pos/ReturnClient'

// ─── Return total calculation ─────────────────────────────────────────────────

describe('calcReturnTotal', () => {
  it('sums qty * unitPrice for all items', () => {
    const items = [
      { qty: 2, unitPrice: 50000 },
      { qty: 1, unitPrice: 30000 },
    ]
    expect(calcReturnTotal(items)).toBe(130000)
  })

  it('returns 0 for empty items array', () => {
    expect(calcReturnTotal([])).toBe(0)
  })

  it('handles single item correctly', () => {
    expect(calcReturnTotal([{ qty: 3, unitPrice: 25000 }])).toBe(75000)
  })
})

// ─── Refund method validation ─────────────────────────────────────────────────

describe('validateRefundMethod', () => {
  it('accepts CASH', () => {
    expect(validateRefundMethod('CASH')).toBe(true)
  })

  it('accepts WALLET', () => {
    expect(validateRefundMethod('WALLET')).toBe(true)
  })

  it('accepts STORE_CREDIT', () => {
    expect(validateRefundMethod('STORE_CREDIT')).toBe(true)
  })

  it('rejects unknown method', () => {
    expect(validateRefundMethod('BITCOIN')).toBe(false)
  })

  it('rejects empty string', () => {
    expect(validateRefundMethod('')).toBe(false)
  })
})

// ─── Status transitions ───────────────────────────────────────────────────────

describe('isStatusTransitionAllowed', () => {
  it('allows PENDING → APPROVED', () => {
    expect(isStatusTransitionAllowed('PENDING', 'APPROVED')).toBe(true)
  })

  it('allows PENDING → REJECTED', () => {
    expect(isStatusTransitionAllowed('PENDING', 'REJECTED')).toBe(true)
  })

  it('allows APPROVED → COMPLETED', () => {
    expect(isStatusTransitionAllowed('APPROVED', 'COMPLETED')).toBe(true)
  })

  it('blocks COMPLETED → PENDING (no going back)', () => {
    expect(isStatusTransitionAllowed('COMPLETED', 'PENDING')).toBe(false)
  })

  it('blocks REJECTED → APPROVED', () => {
    expect(isStatusTransitionAllowed('REJECTED', 'APPROVED')).toBe(false)
  })
})

// ─── Stock restoration logic ──────────────────────────────────────────────────

describe('buildStockRestorations', () => {
  it('returns one entry per unique productId', () => {
    const items = [
      { productId: 'p1', qty: 2 },
      { productId: 'p2', qty: 1 },
    ]
    const result = buildStockRestorations(items)
    expect(result).toHaveLength(2)
  })

  it('merges duplicate productIds by summing qty', () => {
    const items = [
      { productId: 'p1', qty: 2 },
      { productId: 'p1', qty: 3 },
    ]
    const result = buildStockRestorations(items)
    expect(result).toHaveLength(1)
    expect(result[0].qty).toBe(5)
  })

  it('returns empty array for no items', () => {
    expect(buildStockRestorations([])).toEqual([])
  })
})

// ─── Partial return ───────────────────────────────────────────────────────────

describe('calcPartialReturnTotal', () => {
  const allItems: OrderLine[] = [
    { id: 'i1', productId: 'p1', productName: 'Nasi Goreng', qty: 2, unitPrice: 20000, subtotal: 40000 },
    { id: 'i2', productId: 'p2', productName: 'Es Teh', qty: 3, unitPrice: 5000, subtotal: 15000 },
    { id: 'i3', productId: 'p3', productName: 'Sate', qty: 1, unitPrice: 35000, subtotal: 35000 },
  ]

  it('returns 0 when no items are selected', () => {
    expect(calcPartialReturnTotal(allItems, new Set(), new Map())).toBe(0)
  })

  it('returns full total when all items selected with original qty', () => {
    const ids = new Set(['i1', 'i2', 'i3'])
    const qtys = new Map([['i1', 2], ['i2', 3], ['i3', 1]])
    expect(calcPartialReturnTotal(allItems, ids, qtys)).toBe(90000)
  })

  it('calculates partial return for a subset of items', () => {
    const ids = new Set(['i1'])
    const qtys = new Map([['i1', 2]])
    expect(calcPartialReturnTotal(allItems, ids, qtys)).toBe(40000)
  })

  it('respects override qty for partial qty return', () => {
    const ids = new Set(['i2'])
    const qtys = new Map([['i2', 1]]) // return only 1 of 3
    expect(calcPartialReturnTotal(allItems, ids, qtys)).toBe(5000)
  })
})
