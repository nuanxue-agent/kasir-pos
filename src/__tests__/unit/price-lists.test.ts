import { describe, it, expect } from 'vitest'
import {
  applyPriceListDiscount,
  resolveItemPrice,
  isPriceListValid,
  resolveCustomerPriceList,
  getActivePriceLists,
} from '@/lib/price-lists'
import type { PriceList, PriceListItem, CustomerPriceList } from '@/lib/price-lists'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePl(overrides: Partial<PriceList> = {}): PriceList {
  return {
    id: 'pl-1',
    storeId: 'store-1',
    name: 'Test List',
    type: 'RETAIL',
    discountType: 'PERCENTAGE',
    discountValue: 10,
    active: true,
    validFrom: null,
    validTo: null,
    ...overrides,
  }
}

function makeItem(overrides: Partial<PriceListItem> = {}): PriceListItem {
  return {
    id: 'item-1',
    priceListId: 'pl-1',
    storeId: 'store-1',
    productId: 'prod-1',
    price: 80_000,
    minQty: 1,
    ...overrides,
  }
}

// ── 1. Price calculation with discount ───────────────────────────────────────

describe('applyPriceListDiscount — PERCENTAGE', () => {
  it('applies 10% discount correctly', () => {
    expect(applyPriceListDiscount(100_000, 'PERCENTAGE', 10)).toBe(90_000)
  })

  it('applies 0% discount — returns base price', () => {
    expect(applyPriceListDiscount(50_000, 'PERCENTAGE', 0)).toBe(50_000)
  })

  it('applies 100% discount — returns 0', () => {
    expect(applyPriceListDiscount(100_000, 'PERCENTAGE', 100)).toBe(0)
  })
})

describe('applyPriceListDiscount — FIXED', () => {
  it('subtracts fixed amount from base price', () => {
    expect(applyPriceListDiscount(150_000, 'FIXED', 25_000)).toBe(125_000)
  })

  it('floors at 0 when fixed discount exceeds price', () => {
    expect(applyPriceListDiscount(10_000, 'FIXED', 20_000)).toBe(0)
  })
})

// ── 2. Min qty tier pricing ───────────────────────────────────────────────────

describe('resolveItemPrice', () => {
  const items: PriceListItem[] = [
    makeItem({ id: 'i1', minQty: 1, price: 100_000 }),
    makeItem({ id: 'i2', minQty: 10, price: 85_000 }),
    makeItem({ id: 'i3', minQty: 50, price: 70_000 }),
  ]

  it('returns the tier 1 price for qty 1', () => {
    expect(resolveItemPrice(items, 'prod-1', 1)).toBe(100_000)
  })

  it('returns the tier 2 price for qty 10', () => {
    expect(resolveItemPrice(items, 'prod-1', 10)).toBe(85_000)
  })

  it('returns the highest matching tier for qty 50', () => {
    expect(resolveItemPrice(items, 'prod-1', 50)).toBe(70_000)
  })

  it('returns null when qty is below the smallest tier', () => {
    const highMinItems = [makeItem({ minQty: 5, price: 90_000 })]
    expect(resolveItemPrice(highMinItems, 'prod-1', 3)).toBeNull()
  })

  it('returns null when no items match the productId', () => {
    expect(resolveItemPrice(items, 'prod-unknown', 10)).toBeNull()
  })
})

// ── 3. Active price list detection ───────────────────────────────────────────

describe('isPriceListValid', () => {
  const now = '2025-06-15T12:00:00.000Z'

  it('returns true for active list with no date bounds', () => {
    expect(isPriceListValid(makePl(), now)).toBe(true)
  })

  it('returns false for inactive list', () => {
    expect(isPriceListValid(makePl({ active: false }), now)).toBe(false)
  })

  it('returns false when validFrom is in the future', () => {
    expect(isPriceListValid(makePl({ validFrom: '2025-07-01' }), now)).toBe(false)
  })

  it('returns false when validTo is in the past', () => {
    expect(isPriceListValid(makePl({ validTo: '2025-06-01' }), now)).toBe(false)
  })

  it('returns true when now is within validFrom..validTo window', () => {
    expect(isPriceListValid(makePl({ validFrom: '2025-06-01', validTo: '2025-06-30' }), now)).toBe(true)
  })
})

// ── 4. Customer price list resolution ────────────────────────────────────────

describe('resolveCustomerPriceList', () => {
  const priceLists: PriceList[] = [
    makePl({ id: 'pl-vip', type: 'VIP', name: 'VIP List' }),
    makePl({ id: 'pl-ws', type: 'WHOLESALE', name: 'Wholesale List' }),
  ]

  const assignments: CustomerPriceList[] = [
    { id: 'a1', customerId: 'cust-1', storeId: 'store-1', priceListId: 'pl-vip', assignedAt: '2025-05-01T00:00:00Z' },
    { id: 'a2', customerId: 'cust-1', storeId: 'store-1', priceListId: 'pl-ws', assignedAt: '2025-04-01T00:00:00Z' },
    { id: 'a3', customerId: 'cust-2', storeId: 'store-1', priceListId: 'pl-ws', assignedAt: '2025-05-01T00:00:00Z' },
  ]

  it('resolves the most-recently-assigned valid price list for the customer', () => {
    const result = resolveCustomerPriceList(assignments, priceLists, 'cust-1')
    expect(result?.id).toBe('pl-vip')
  })

  it('resolves correct price list for a different customer', () => {
    const result = resolveCustomerPriceList(assignments, priceLists, 'cust-2')
    expect(result?.id).toBe('pl-ws')
  })

  it('returns null for a customer with no assignments', () => {
    expect(resolveCustomerPriceList(assignments, priceLists, 'cust-unknown')).toBeNull()
  })

  it('skips inactive price lists and returns null when none valid', () => {
    const inactiveLists = priceLists.map(p => ({ ...p, active: false }))
    expect(resolveCustomerPriceList(assignments, inactiveLists, 'cust-1')).toBeNull()
  })
})

// ── 5. Validity date check (getActivePriceLists) ──────────────────────────────

describe('getActivePriceLists', () => {
  const now = '2025-06-15T12:00:00.000Z'

  it('returns only active lists within date range', () => {
    const lists: PriceList[] = [
      makePl({ id: 'pl-1', active: true, validFrom: '2025-06-01', validTo: '2025-06-30' }),
      makePl({ id: 'pl-2', active: true, validFrom: '2025-07-01', validTo: null }),
      makePl({ id: 'pl-3', active: false }),
    ]
    const result = getActivePriceLists(lists, now)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('pl-1')
  })

  it('sorts by type priority: VIP before WHOLESALE before RETAIL before CUSTOM', () => {
    const lists: PriceList[] = [
      makePl({ id: 'c', type: 'CUSTOM' }),
      makePl({ id: 'r', type: 'RETAIL' }),
      makePl({ id: 'v', type: 'VIP' }),
      makePl({ id: 'w', type: 'WHOLESALE' }),
    ]
    const result = getActivePriceLists(lists, now)
    expect(result.map(p => p.id)).toEqual(['v', 'w', 'r', 'c'])
  })
})
