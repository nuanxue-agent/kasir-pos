import { describe, it, expect } from 'vitest'

// ─── Types ────────────────────────────────────────────────────────────────────

type POStatus = 'DRAFT' | 'SENT' | 'CONFIRMED' | 'RECEIVED' | 'CANCELLED'

interface ReceiveItem {
  productId: string
  lineId: string
  productName: string
  orderedQty: number
  unitCost: number
  receivedQty: number
  batchNumber: string
  expiryDate: string
}

// ─── Pure functions (mirror of GoodsReceiptClient exports) ────────────────────

function calcVariance(orderedQty: number, receivedQty: number): number {
  return receivedQty - orderedQty
}

function calcVariancePct(orderedQty: number, receivedQty: number): number {
  if (orderedQty === 0) return 0
  return ((receivedQty - orderedQty) / orderedQty) * 100
}

function isPartialReceipt(items: ReceiveItem[]): boolean {
  return items.some(i => i.receivedQty < i.orderedQty && i.receivedQty >= 0)
}

function calcTotalCost(items: ReceiveItem[]): number {
  return items.reduce((sum, i) => sum + i.receivedQty * i.unitCost, 0)
}

function calcCostPerUnit(totalCost: number, totalQty: number): number {
  if (totalQty === 0) return 0
  return totalCost / totalQty
}

function canReceive(status: POStatus): boolean {
  return status === 'SENT' || status === 'CONFIRMED'
}

function calcNewStock(currentStock: number, receivedQty: number): number {
  return currentStock + receivedQty
}

function validateReceiveItems(
  items: Array<{ receivedQty: number; unitCost: number; productId: string }>,
): string | null {
  for (const item of items) {
    if (!item.productId) return 'productId diperlukan'
    if (isNaN(item.receivedQty) || item.receivedQty < 0)
      return `receivedQty tidak valid untuk produk ${item.productId}`
    if (item.unitCost < 0)
      return `unitCost tidak boleh negatif untuk produk ${item.productId}`
  }
  const hasPositive = items.some(i => i.receivedQty > 0)
  if (!hasPositive) return 'Minimal 1 item dengan receivedQty > 0'
  return null
}

function isPOFullyReceived(
  lines: Array<{ qty: number; receivedQty: number }>,
): boolean {
  return lines.length > 0 && lines.every(l => l.receivedQty >= l.qty)
}

// ─── Test data helpers ────────────────────────────────────────────────────────

function makeItem(overrides: Partial<ReceiveItem> = {}): ReceiveItem {
  return {
    productId: 'prod-1',
    lineId: 'line-1',
    productName: 'Minyak Goreng 1L',
    orderedQty: 10,
    unitCost: 15000,
    receivedQty: 10,
    batchNumber: '',
    expiryDate: '',
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Goods Receipt — received qty validation', () => {
  it('rejects negative receivedQty', () => {
    const err = validateReceiveItems([{ productId: 'p1', receivedQty: -1, unitCost: 1000 }])
    expect(err).toContain('receivedQty tidak valid')
  })

  it('rejects when all items have zero receivedQty', () => {
    const err = validateReceiveItems([{ productId: 'p1', receivedQty: 0, unitCost: 1000 }])
    expect(err).toBe('Minimal 1 item dengan receivedQty > 0')
  })

  it('accepts valid items with positive qty', () => {
    const err = validateReceiveItems([{ productId: 'p1', receivedQty: 5, unitCost: 1000 }])
    expect(err).toBeNull()
  })

  it('rejects negative unitCost', () => {
    const err = validateReceiveItems([{ productId: 'p1', receivedQty: 5, unitCost: -100 }])
    expect(err).toContain('unitCost tidak boleh negatif')
  })
})

describe('Goods Receipt — variance calculation', () => {
  it('returns 0 variance when ordered equals received', () => {
    expect(calcVariance(10, 10)).toBe(0)
  })

  it('returns negative variance for short delivery', () => {
    expect(calcVariance(10, 7)).toBe(-3)
  })

  it('returns positive variance for over-delivery', () => {
    expect(calcVariance(10, 12)).toBe(2)
  })

  it('calculates variance percentage correctly', () => {
    expect(calcVariancePct(10, 8)).toBeCloseTo(-20)
  })

  it('returns 0 pct variance when orderedQty is 0 (guard against division by zero)', () => {
    expect(calcVariancePct(0, 5)).toBe(0)
  })
})

describe('Goods Receipt — stock update after receipt', () => {
  it('adds received qty to current stock', () => {
    expect(calcNewStock(50, 10)).toBe(60)
  })

  it('handles zero current stock', () => {
    expect(calcNewStock(0, 25)).toBe(25)
  })
})

describe('Goods Receipt — partial receipt handling', () => {
  it('detects partial receipt when at least one item is under-received', () => {
    const items = [makeItem({ orderedQty: 10, receivedQty: 10 }), makeItem({ orderedQty: 10, receivedQty: 6 })]
    expect(isPartialReceipt(items)).toBe(true)
  })

  it('returns false when all items are fully received', () => {
    const items = [makeItem({ orderedQty: 10, receivedQty: 10 }), makeItem({ orderedQty: 5, receivedQty: 5 })]
    expect(isPartialReceipt(items)).toBe(false)
  })

  it('marks PO as RECEIVED only when all lines reach orderedQty', () => {
    const fullLines = [
      { qty: 10, receivedQty: 10 },
      { qty: 5, receivedQty: 5 },
    ]
    expect(isPOFullyReceived(fullLines)).toBe(true)
  })

  it('does NOT mark PO received when a line is still short', () => {
    const partialLines = [
      { qty: 10, receivedQty: 10 },
      { qty: 5, receivedQty: 3 },
    ]
    expect(isPOFullyReceived(partialLines)).toBe(false)
  })
})

describe('Goods Receipt — cost per unit calculation', () => {
  it('calculates total cost from multiple items', () => {
    const items = [
      makeItem({ receivedQty: 5, unitCost: 10000 }),
      makeItem({ productId: 'prod-2', receivedQty: 3, unitCost: 20000 }),
    ]
    expect(calcTotalCost(items)).toBe(110000)
  })

  it('calculates cost per unit correctly', () => {
    expect(calcCostPerUnit(110000, 8)).toBeCloseTo(13750)
  })

  it('returns 0 cost per unit when totalQty is 0', () => {
    expect(calcCostPerUnit(50000, 0)).toBe(0)
  })
})

describe('Goods Receipt — PO status guard', () => {
  it('allows receiving goods for SENT POs', () => {
    expect(canReceive('SENT')).toBe(true)
  })

  it('allows receiving goods for CONFIRMED POs', () => {
    expect(canReceive('CONFIRMED')).toBe(true)
  })

  it('blocks receiving for DRAFT POs', () => {
    expect(canReceive('DRAFT')).toBe(false)
  })

  it('blocks receiving for already-RECEIVED POs', () => {
    expect(canReceive('RECEIVED')).toBe(false)
  })
})
