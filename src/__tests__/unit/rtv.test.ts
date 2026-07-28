import { describe, it, expect } from 'vitest'

// ─── Types ────────────────────────────────────────────────────────────────────

type RTVStatus = 'DRAFT' | 'SUBMITTED' | 'ACKNOWLEDGED' | 'SHIPPED' | 'COMPLETED' | 'CANCELLED'
type RTVReason = 'DEFECTIVE' | 'EXCESS' | 'WRONG_ITEM' | 'EXPIRED'
type ItemCondition = 'DAMAGED' | 'UNOPENED' | 'OPENED' | 'EXPIRED'

// ─── Pure functions (mirror of RTVClient exports) ─────────────────────────────

function calcRTVTotalValue(items: Array<{ qty: number; unitCost: number }>): number {
  return items.reduce((sum, i) => sum + i.qty * i.unitCost, 0)
}

function calcRTVTotalItems(items: Array<{ qty: number }>): number {
  return items.reduce((sum, i) => sum + i.qty, 0)
}

function calcCreditNoteAmount(
  items: Array<{ qty: number; unitCost: number }>,
  creditPct: number,
): number {
  const total = calcRTVTotalValue(items)
  if (creditPct < 0 || creditPct > 100) return 0
  return Math.round((total * creditPct) / 100)
}

const VALID_TRANSITIONS: Record<RTVStatus, RTVStatus[]> = {
  DRAFT:        ['SUBMITTED', 'CANCELLED'],
  SUBMITTED:    ['ACKNOWLEDGED', 'CANCELLED'],
  ACKNOWLEDGED: ['SHIPPED', 'CANCELLED'],
  SHIPPED:      ['COMPLETED', 'CANCELLED'],
  COMPLETED:    [],
  CANCELLED:    [],
}

function canTransitionRTV(from: RTVStatus, to: RTVStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}

function classifyItemCondition(condition: ItemCondition): { label: string; creditEligible: boolean } {
  switch (condition) {
    case 'DAMAGED':  return { label: 'Rusak',      creditEligible: false }
    case 'UNOPENED': return { label: 'Tersegel',   creditEligible: true }
    case 'OPENED':   return { label: 'Terbuka',    creditEligible: false }
    case 'EXPIRED':  return { label: 'Kadaluarsa', creditEligible: false }
  }
}

function calcVendorReturnRate(totalOrdered: number, totalReturned: number): number {
  if (totalOrdered === 0) return 0
  return Math.round((totalReturned / totalOrdered) * 10000) / 100
}

function validateRTVItems(
  items: Array<{ productId: string; qty: number; unitCost: number }>,
): string | null {
  for (const item of items) {
    if (!item.productId) return 'productId diperlukan'
    if (isNaN(item.qty) || item.qty <= 0) return `qty harus > 0 untuk produk ${item.productId}`
    if (item.unitCost < 0) return `unitCost tidak boleh negatif untuk produk ${item.productId}`
  }
  return null
}

// ─── Test data helpers ────────────────────────────────────────────────────────

function makeRTVItem(overrides: Partial<{ qty: number; unitCost: number; productId: string }> = {}) {
  return { productId: 'prod-1', qty: 10, unitCost: 20000, ...overrides }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('RTV — value calculation', () => {
  it('calculates total value from multiple items', () => {
    const items = [
      makeRTVItem({ qty: 5, unitCost: 10000 }),
      makeRTVItem({ productId: 'prod-2', qty: 3, unitCost: 25000 }),
    ]
    expect(calcRTVTotalValue(items)).toBe(125000)
  })

  it('calculates total item count correctly', () => {
    const items = [makeRTVItem({ qty: 4 }), makeRTVItem({ qty: 6 })]
    expect(calcRTVTotalItems(items)).toBe(10)
  })

  it('returns 0 for empty item list', () => {
    expect(calcRTVTotalValue([])).toBe(0)
    expect(calcRTVTotalItems([])).toBe(0)
  })
})

describe('RTV — status transition validation', () => {
  it('allows DRAFT → SUBMITTED', () => {
    expect(canTransitionRTV('DRAFT', 'SUBMITTED')).toBe(true)
  })

  it('allows SUBMITTED → ACKNOWLEDGED', () => {
    expect(canTransitionRTV('SUBMITTED', 'ACKNOWLEDGED')).toBe(true)
  })

  it('allows ACKNOWLEDGED → SHIPPED', () => {
    expect(canTransitionRTV('ACKNOWLEDGED', 'SHIPPED')).toBe(true)
  })

  it('allows SHIPPED → COMPLETED', () => {
    expect(canTransitionRTV('SHIPPED', 'COMPLETED')).toBe(true)
  })

  it('allows any active status → CANCELLED', () => {
    expect(canTransitionRTV('DRAFT', 'CANCELLED')).toBe(true)
    expect(canTransitionRTV('SUBMITTED', 'CANCELLED')).toBe(true)
    expect(canTransitionRTV('SHIPPED', 'CANCELLED')).toBe(true)
  })

  it('blocks skipping steps (DRAFT → SHIPPED)', () => {
    expect(canTransitionRTV('DRAFT', 'SHIPPED')).toBe(false)
  })

  it('blocks transition from COMPLETED', () => {
    expect(canTransitionRTV('COMPLETED', 'SHIPPED')).toBe(false)
    expect(canTransitionRTV('COMPLETED', 'CANCELLED')).toBe(false)
  })
})

describe('RTV — credit note amount', () => {
  it('calculates 100% credit note correctly', () => {
    const items = [makeRTVItem({ qty: 5, unitCost: 20000 })]
    expect(calcCreditNoteAmount(items, 100)).toBe(100000)
  })

  it('calculates partial credit (50%)', () => {
    const items = [makeRTVItem({ qty: 4, unitCost: 10000 })]
    expect(calcCreditNoteAmount(items, 50)).toBe(20000)
  })

  it('returns 0 for invalid credit percentage (> 100)', () => {
    const items = [makeRTVItem({ qty: 2, unitCost: 5000 })]
    expect(calcCreditNoteAmount(items, 150)).toBe(0)
  })

  it('returns 0 for negative credit percentage', () => {
    const items = [makeRTVItem({ qty: 2, unitCost: 5000 })]
    expect(calcCreditNoteAmount(items, -10)).toBe(0)
  })
})

describe('RTV — item condition classification', () => {
  it('UNOPENED items are credit-eligible', () => {
    const result = classifyItemCondition('UNOPENED')
    expect(result.creditEligible).toBe(true)
    expect(result.label).toBe('Tersegel')
  })

  it('DAMAGED items are not credit-eligible', () => {
    const result = classifyItemCondition('DAMAGED')
    expect(result.creditEligible).toBe(false)
  })

  it('OPENED items are not credit-eligible', () => {
    expect(classifyItemCondition('OPENED').creditEligible).toBe(false)
  })

  it('EXPIRED items are not credit-eligible', () => {
    expect(classifyItemCondition('EXPIRED').creditEligible).toBe(false)
  })
})

describe('RTV — vendor return rate', () => {
  it('calculates return rate as a percentage', () => {
    expect(calcVendorReturnRate(200, 10)).toBe(5)
  })

  it('returns 0 when totalOrdered is 0 (guard against division by zero)', () => {
    expect(calcVendorReturnRate(0, 5)).toBe(0)
  })

  it('returns 100 when all ordered items are returned', () => {
    expect(calcVendorReturnRate(50, 50)).toBe(100)
  })
})

describe('RTV — item validation', () => {
  it('rejects items with missing productId', () => {
    const err = validateRTVItems([{ productId: '', qty: 5, unitCost: 1000 }])
    expect(err).toContain('productId diperlukan')
  })

  it('rejects items with zero qty', () => {
    const err = validateRTVItems([{ productId: 'p1', qty: 0, unitCost: 1000 }])
    expect(err).toContain('qty harus > 0')
  })

  it('rejects items with negative unitCost', () => {
    const err = validateRTVItems([{ productId: 'p1', qty: 5, unitCost: -500 }])
    expect(err).toContain('unitCost tidak boleh negatif')
  })

  it('accepts valid items', () => {
    const err = validateRTVItems([{ productId: 'p1', qty: 3, unitCost: 15000 }])
    expect(err).toBeNull()
  })
})
