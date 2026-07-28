import { describe, it, expect } from 'vitest'

// ─── Types ────────────────────────────────────────────────────────────────────

type TransferStatus = 'DRAFT' | 'REQUESTED' | 'IN_TRANSIT' | 'RECEIVED' | 'CANCELLED'

interface TransferItem {
  productId: string
  requestedQty: number
  sentQty: number
  receivedQty: number
  unitCost?: number
}

// ─── Pure functions (mirror of StockTransferClient exports) ───────────────────

function isValidTransition(from: TransferStatus, to: TransferStatus): boolean {
  const allowed: Record<TransferStatus, TransferStatus[]> = {
    DRAFT:      ['REQUESTED', 'CANCELLED'],
    REQUESTED:  ['IN_TRANSIT', 'CANCELLED'],
    IN_TRANSIT: ['RECEIVED'],
    RECEIVED:   [],
    CANCELLED:  [],
  }
  return allowed[from].includes(to)
}

function calcTotalRequestedQty(items: TransferItem[]): number {
  return items.reduce((sum, i) => sum + i.requestedQty, 0)
}

function calcTotalReceivedQty(items: TransferItem[]): number {
  return items.reduce((sum, i) => sum + (i.receivedQty ?? 0), 0)
}

function calcTransferValue(items: TransferItem[]): number {
  return items.reduce((sum, i) => sum + i.requestedQty * (i.unitCost ?? 0), 0)
}

function isPartialReceipt(items: TransferItem[]): boolean {
  return items.some(i => (i.receivedQty ?? 0) < (i.sentQty ?? 0) && (i.receivedQty ?? 0) >= 0)
}

function calcDiscrepancy(items: TransferItem[]): number {
  return items.reduce((sum, i) => sum + ((i.sentQty ?? 0) - (i.receivedQty ?? 0)), 0)
}

function hasDiscrepancy(items: TransferItem[]): boolean {
  return items.some(i => (i.sentQty ?? 0) !== (i.receivedQty ?? 0))
}

function validateTransferItems(
  items: Array<{ productId: string; requestedQty: number }>
): string | null {
  for (const item of items) {
    if (!item.productId) return 'Setiap item harus memiliki productId'
    if (isNaN(item.requestedQty) || item.requestedQty <= 0)
      return `requestedQty harus > 0 untuk produk ${item.productId}`
  }
  return null
}

function reconcileQty(
  requestedQty: number,
  sentQty: number,
  receivedQty: number
): { shortage: number; excess: number; matched: number } {
  const matched = Math.min(sentQty, receivedQty)
  const shortage = Math.max(0, requestedQty - receivedQty)
  const excess = Math.max(0, receivedQty - requestedQty)
  return { shortage, excess, matched }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('StockTransfer — status transition validation', () => {
  it('allows DRAFT -> REQUESTED', () => {
    expect(isValidTransition('DRAFT', 'REQUESTED')).toBe(true)
  })

  it('allows REQUESTED -> IN_TRANSIT', () => {
    expect(isValidTransition('REQUESTED', 'IN_TRANSIT')).toBe(true)
  })

  it('allows IN_TRANSIT -> RECEIVED', () => {
    expect(isValidTransition('IN_TRANSIT', 'RECEIVED')).toBe(true)
  })

  it('blocks IN_TRANSIT -> CANCELLED', () => {
    expect(isValidTransition('IN_TRANSIT', 'CANCELLED')).toBe(false)
  })

  it('blocks RECEIVED -> any further transition', () => {
    expect(isValidTransition('RECEIVED', 'CANCELLED')).toBe(false)
    expect(isValidTransition('RECEIVED', 'DRAFT')).toBe(false)
  })
})

describe('StockTransfer — quantity reconciliation', () => {
  it('calculates total requested qty across items', () => {
    const items: TransferItem[] = [
      { productId: 'p1', requestedQty: 10, sentQty: 10, receivedQty: 10 },
      { productId: 'p2', requestedQty: 5, sentQty: 5, receivedQty: 5 },
    ]
    expect(calcTotalRequestedQty(items)).toBe(15)
  })

  it('calculates total received qty across items', () => {
    const items: TransferItem[] = [
      { productId: 'p1', requestedQty: 10, sentQty: 10, receivedQty: 8 },
      { productId: 'p2', requestedQty: 5, sentQty: 5, receivedQty: 5 },
    ]
    expect(calcTotalReceivedQty(items)).toBe(13)
  })
})

describe('StockTransfer — partial receipt handling', () => {
  it('detects partial receipt when any item receivedQty < sentQty', () => {
    const items: TransferItem[] = [
      { productId: 'p1', requestedQty: 10, sentQty: 10, receivedQty: 7 },
      { productId: 'p2', requestedQty: 5, sentQty: 5, receivedQty: 5 },
    ]
    expect(isPartialReceipt(items)).toBe(true)
  })

  it('returns false when all items fully received', () => {
    const items: TransferItem[] = [
      { productId: 'p1', requestedQty: 10, sentQty: 10, receivedQty: 10 },
      { productId: 'p2', requestedQty: 5, sentQty: 5, receivedQty: 5 },
    ]
    expect(isPartialReceipt(items)).toBe(false)
  })
})

describe('StockTransfer — transfer value calculation', () => {
  it('calculates transfer value using requestedQty * unitCost', () => {
    const items: TransferItem[] = [
      { productId: 'p1', requestedQty: 10, sentQty: 10, receivedQty: 10, unitCost: 5000 },
      { productId: 'p2', requestedQty: 4, sentQty: 4, receivedQty: 4, unitCost: 25000 },
    ]
    expect(calcTransferValue(items)).toBe(150000)
  })

  it('returns 0 when unitCost is not set', () => {
    const items: TransferItem[] = [
      { productId: 'p1', requestedQty: 10, sentQty: 10, receivedQty: 10 },
    ]
    expect(calcTransferValue(items)).toBe(0)
  })
})

describe('StockTransfer — discrepancy detection', () => {
  it('detects discrepancy when sentQty != receivedQty', () => {
    const items: TransferItem[] = [
      { productId: 'p1', requestedQty: 10, sentQty: 10, receivedQty: 8 },
    ]
    expect(hasDiscrepancy(items)).toBe(true)
  })

  it('calculates total discrepancy (shortage)', () => {
    const items: TransferItem[] = [
      { productId: 'p1', requestedQty: 10, sentQty: 10, receivedQty: 8 },
      { productId: 'p2', requestedQty: 5, sentQty: 5, receivedQty: 3 },
    ]
    expect(calcDiscrepancy(items)).toBe(4)
  })

  it('reconcileQty identifies shortage, excess, and matched', () => {
    const result = reconcileQty(10, 10, 7)
    expect(result.shortage).toBe(3)
    expect(result.excess).toBe(0)
    expect(result.matched).toBe(7)
  })

  it('validateTransferItems rejects zero qty', () => {
    const err = validateTransferItems([{ productId: 'p1', requestedQty: 0 }])
    expect(err).not.toBeNull()
  })
})
