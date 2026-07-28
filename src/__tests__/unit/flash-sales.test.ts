import { describe, it, expect } from 'vitest'

// ── Types ─────────────────────────────────────────────────────────────────────

type DiscountType = 'PERCENTAGE' | 'FIXED'

interface FlashSaleItem {
  id: string
  saleId: string
  productId: string
  discountType: DiscountType
  discountValue: number
  maxQty: number     // 0 = unlimited
  soldQty: number
}

interface FlashSale {
  id: string
  storeId: string
  name: string
  startAt: string   // ISO string
  endAt: string     // ISO string
  active: boolean
  items: FlashSaleItem[]
}

// ── Business Logic ─────────────────────────────────────────────────────────────

/** True when the sale is active AND the current time is within [startAt, endAt) */
function isFlashSaleActive(sale: FlashSale, now: Date = new Date()): boolean {
  if (!sale.active) return false
  const t = now.getTime()
  return new Date(sale.startAt).getTime() <= t && t < new Date(sale.endAt).getTime()
}

/** True when endAt has passed */
function isFlashSaleExpired(sale: FlashSale, now: Date = new Date()): boolean {
  return new Date(sale.endAt).getTime() <= now.getTime()
}

/** Calculate the discounted price for an item */
function calcDiscountedPrice(originalPrice: number, discountType: DiscountType, discountValue: number): number {
  if (discountType === 'PERCENTAGE') {
    return Math.round(originalPrice * (1 - discountValue / 100))
  }
  return Math.max(0, originalPrice - discountValue)
}

/** Returns the flash price if item has remaining stock quota, else the original price */
function getFlashPrice(
  originalPrice: number,
  item: FlashSaleItem,
): number {
  if (item.maxQty > 0 && item.soldQty >= item.maxQty) return originalPrice
  return calcDiscountedPrice(originalPrice, item.discountType, item.discountValue)
}

/** Whether an item still has available quota (maxQty=0 means unlimited) */
function hasRemainingStock(item: FlashSaleItem): boolean {
  if (item.maxQty === 0) return true
  return item.soldQty < item.maxQty
}

/**
 * Detect overlap: two sales on the same storeId overlap when their time ranges intersect
 * AND they share at least one productId.
 */
function detectOverlap(a: FlashSale, b: FlashSale): boolean {
  if (a.storeId !== b.storeId) return false
  // Time ranges must intersect: a.start < b.end AND b.start < a.end
  const aStart = new Date(a.startAt).getTime()
  const aEnd = new Date(a.endAt).getTime()
  const bStart = new Date(b.startAt).getTime()
  const bEnd = new Date(b.endAt).getTime()
  if (aStart >= bEnd || bStart >= aEnd) return false
  // At least one product in common
  const aProducts = new Set(a.items.map(i => i.productId))
  return b.items.some(i => aProducts.has(i.productId))
}

// ── Fixtures ───────────────────────────────────────────────────────────────────

const now = new Date('2025-06-15T12:00:00Z')
const STORE = 'store-1'

function makeItem(overrides: Partial<FlashSaleItem> = {}): FlashSaleItem {
  return {
    id: 'item-1',
    saleId: 'sale-1',
    productId: 'prod-1',
    discountType: 'PERCENTAGE',
    discountValue: 20,
    maxQty: 10,
    soldQty: 0,
    ...overrides,
  }
}

function makeSale(overrides: Partial<FlashSale> = {}): FlashSale {
  return {
    id: 'sale-1',
    storeId: STORE,
    name: 'Test Sale',
    startAt: '2025-06-15T10:00:00Z',
    endAt: '2025-06-15T18:00:00Z',
    active: true,
    items: [makeItem()],
    ...overrides,
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('Flash Sale — active check (within time range)', () => {
  it('returns true when active=true and now is within range', () => {
    expect(isFlashSaleActive(makeSale(), now)).toBe(true)
  })

  it('returns false when active=false even within time range', () => {
    expect(isFlashSaleActive(makeSale({ active: false }), now)).toBe(false)
  })

  it('returns false when now is before startAt', () => {
    const early = new Date('2025-06-15T09:59:59Z')
    expect(isFlashSaleActive(makeSale(), early)).toBe(false)
  })

  it('returns false when now is exactly at endAt (exclusive boundary)', () => {
    const atEnd = new Date('2025-06-15T18:00:00Z')
    expect(isFlashSaleActive(makeSale(), atEnd)).toBe(false)
  })
})

describe('Flash Sale — discount price calculation', () => {
  it('applies percentage discount correctly', () => {
    expect(calcDiscountedPrice(100_000, 'PERCENTAGE', 20)).toBe(80_000)
  })

  it('applies fixed discount correctly', () => {
    expect(calcDiscountedPrice(50_000, 'FIXED', 10_000)).toBe(40_000)
  })

  it('clamps fixed discount to zero (never negative)', () => {
    expect(calcDiscountedPrice(5_000, 'FIXED', 10_000)).toBe(0)
  })

  it('rounds percentage result to nearest integer', () => {
    // 15% of 99_999 = 84_999.15 → 84999
    expect(calcDiscountedPrice(99_999, 'PERCENTAGE', 15)).toBe(84_999)
  })
})

describe('Flash Sale — stock limit enforcement', () => {
  it('returns flash price when soldQty < maxQty', () => {
    const item = makeItem({ discountType: 'PERCENTAGE', discountValue: 20, maxQty: 10, soldQty: 5 })
    expect(getFlashPrice(100_000, item)).toBe(80_000)
  })

  it('returns original price when soldQty >= maxQty (stock exhausted)', () => {
    const item = makeItem({ discountType: 'PERCENTAGE', discountValue: 20, maxQty: 10, soldQty: 10 })
    expect(getFlashPrice(100_000, item)).toBe(100_000)
  })

  it('treats maxQty=0 as unlimited stock', () => {
    const item = makeItem({ discountType: 'FIXED', discountValue: 5_000, maxQty: 0, soldQty: 999 })
    expect(hasRemainingStock(item)).toBe(true)
    expect(getFlashPrice(50_000, item)).toBe(45_000)
  })
})

describe('Flash Sale — auto-expire logic', () => {
  it('marks sale as expired when endAt is in the past', () => {
    const past = new Date('2025-06-15T18:00:01Z')
    expect(isFlashSaleExpired(makeSale(), past)).toBe(true)
  })

  it('does not mark sale as expired when endAt is in the future', () => {
    const before = new Date('2025-06-15T17:59:59Z')
    expect(isFlashSaleExpired(makeSale(), before)).toBe(false)
  })

  it('isFlashSaleActive returns false for expired sale regardless of active flag', () => {
    const past = new Date('2025-12-31T23:59:59Z')
    expect(isFlashSaleActive(makeSale({ active: true }), past)).toBe(false)
  })
})

describe('Flash Sale — overlapping sale detection', () => {
  it('detects overlap when two sales share a product in overlapping time range', () => {
    const a = makeSale({ id: 'sale-a', startAt: '2025-06-15T10:00:00Z', endAt: '2025-06-15T18:00:00Z' })
    const b = makeSale({ id: 'sale-b', startAt: '2025-06-15T14:00:00Z', endAt: '2025-06-15T20:00:00Z' })
    expect(detectOverlap(a, b)).toBe(true)
  })

  it('no overlap when time ranges do not intersect', () => {
    const a = makeSale({ id: 'sale-a', startAt: '2025-06-15T06:00:00Z', endAt: '2025-06-15T10:00:00Z' })
    const b = makeSale({ id: 'sale-b', startAt: '2025-06-15T10:00:00Z', endAt: '2025-06-15T18:00:00Z' })
    expect(detectOverlap(a, b)).toBe(false)
  })

  it('no overlap when products do not overlap even in same time range', () => {
    const a = makeSale({ id: 'sale-a', items: [makeItem({ productId: 'prod-A' })] })
    const b = makeSale({ id: 'sale-b', items: [makeItem({ productId: 'prod-B', saleId: 'sale-b' })] })
    expect(detectOverlap(a, b)).toBe(false)
  })

  it('no overlap between sales from different stores', () => {
    const a = makeSale({ id: 'sale-a', storeId: 'store-1' })
    const b = makeSale({ id: 'sale-b', storeId: 'store-2' })
    expect(detectOverlap(a, b)).toBe(false)
  })
})
