import { describe, it, expect } from 'vitest'
import {
  distributeEvenly,
  validateSplitItems,
  reconcileSplitAmounts,
  validateMerge,
  calcMergedTotal,
} from '@/components/pos/OrderSplitClient'
import type { OrderItem, Order } from '@/components/pos/OrderSplitClient'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeItem(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    id: 'item-1',
    orderId: 'order-1',
    productId: 'prod-1',
    variantId: null,
    name: 'Nasi Goreng',
    variantName: null,
    price: 20_000,
    qty: 2,
    discount: 0,
    subtotal: 40_000,
    ...overrides,
  }
}

function makeOrder(overrides: Partial<Order> = {}): Order {
  const items: OrderItem[] = [
    makeItem({ id: 'item-1', name: 'Nasi Goreng', price: 20_000, qty: 2, subtotal: 40_000 }),
    makeItem({ id: 'item-2', name: 'Es Teh', price: 5_000, qty: 4, subtotal: 20_000 }),
  ]
  return {
    id: 'order-1',
    storeId: 'store-1',
    number: 'INV-001',
    status: 'PENDING',
    tableId: 'table-1',
    tableNumber: 1,
    subtotal: 60_000,
    discountAmt: 0,
    taxAmt: 0,
    total: 60_000,
    items,
    ...overrides,
  }
}

// ─── 1. distributeEvenly — items distributed correctly ────────────────────────

describe('distributeEvenly — items distributed correctly', () => {
  it('splits two items across two seats evenly', () => {
    const items: OrderItem[] = [
      makeItem({ id: 'i1', qty: 2, price: 20_000 }),
      makeItem({ id: 'i2', qty: 2, price: 5_000 }),
    ]
    const buckets = distributeEvenly(items, 2)
    expect(buckets).toHaveLength(2)
    // Each bucket gets 1 of each item
    expect(buckets[0].find(b => b.item.id === 'i1')?.qty).toBe(1)
    expect(buckets[1].find(b => b.item.id === 'i1')?.qty).toBe(1)
  })

  it('handles odd qty — remainder goes to earlier seats', () => {
    const items: OrderItem[] = [makeItem({ id: 'i1', qty: 3, price: 10_000 })]
    const buckets = distributeEvenly(items, 2)
    const seat1 = buckets[0].find(b => b.item.id === 'i1')?.qty ?? 0
    const seat2 = buckets[1].find(b => b.item.id === 'i1')?.qty ?? 0
    expect(seat1 + seat2).toBe(3)
    expect(seat1).toBe(2) // remainder to first seat
    expect(seat2).toBe(1)
  })

  it('returns empty array for count = 0', () => {
    expect(distributeEvenly([makeItem()], 0)).toEqual([])
  })

  it('single seat returns all items in one bucket', () => {
    const items = [makeItem({ qty: 5 })]
    const buckets = distributeEvenly(items, 1)
    expect(buckets).toHaveLength(1)
    expect(buckets[0][0].qty).toBe(5)
  })
})

// ─── 2. validateSplitItems ────────────────────────────────────────────────────

describe('validateSplitItems', () => {
  it('returns null for valid split items', () => {
    const order = makeOrder()
    const result = validateSplitItems(order.items, [
      { orderItemId: 'item-1', qty: 1 },
      { orderItemId: 'item-2', qty: 2 },
    ])
    expect(result).toBeNull()
  })

  it('rejects split qty greater than ordered qty', () => {
    const order = makeOrder()
    const result = validateSplitItems(order.items, [{ orderItemId: 'item-1', qty: 5 }])
    expect(result).toMatch(/exceeds ordered qty/)
  })

  it('rejects qty of zero', () => {
    const order = makeOrder()
    const result = validateSplitItems(order.items, [{ orderItemId: 'item-1', qty: 0 }])
    expect(result).toMatch(/must be > 0/)
  })

  it('rejects unknown orderItemId', () => {
    const order = makeOrder()
    const result = validateSplitItems(order.items, [{ orderItemId: 'nonexistent', qty: 1 }])
    expect(result).toMatch(/not found/)
  })

  it('partial item split — exactly at max qty is valid', () => {
    const order = makeOrder()
    const result = validateSplitItems(order.items, [{ orderItemId: 'item-1', qty: 2 }])
    expect(result).toBeNull()
  })
})

// ─── 3. reconcileSplitAmounts ─────────────────────────────────────────────────

describe('reconcileSplitAmounts', () => {
  it('returns ok:true when split totals exactly match original', () => {
    const subOrders = [{ id: 'a', label: 'A', items: [], total: 30_000 }, { id: 'b', label: 'B', items: [], total: 30_000 }]
    const { ok, diff } = reconcileSplitAmounts(60_000, subOrders)
    expect(ok).toBe(true)
    expect(diff).toBe(0)
  })

  it('returns ok:true with rounding diff of 1', () => {
    const subOrders = [{ id: 'a', label: 'A', items: [], total: 29_999 }, { id: 'b', label: 'B', items: [], total: 30_000 }]
    const { ok, diff } = reconcileSplitAmounts(60_000, subOrders)
    expect(ok).toBe(true)
    expect(diff).toBe(1)
  })

  it('returns ok:false when diff exceeds tolerance', () => {
    const subOrders = [{ id: 'a', label: 'A', items: [], total: 25_000 }, { id: 'b', label: 'B', items: [], total: 25_000 }]
    const { ok, diff } = reconcileSplitAmounts(60_000, subOrders)
    expect(ok).toBe(false)
    expect(diff).toBe(10_000)
  })
})

// ─── 4. validateMerge ────────────────────────────────────────────────────────

describe('validateMerge', () => {
  it('returns null for valid merge of two PENDING orders', () => {
    const a = makeOrder({ id: 'order-a', status: 'PENDING' })
    const b = makeOrder({ id: 'order-b', status: 'PENDING' })
    expect(validateMerge(a, b, 'store-1')).toBeNull()
  })

  it('rejects merging an order with itself', () => {
    const a = makeOrder()
    expect(validateMerge(a, a, 'store-1')).toMatch(/itself/)
  })

  it('rejects when source order is PAID', () => {
    const a = makeOrder({ id: 'order-a', status: 'PAID' })
    const b = makeOrder({ id: 'order-b', status: 'PENDING' })
    expect(validateMerge(a, b, 'store-1')).toMatch(/Source order must be PENDING/)
  })

  it('rejects when target order is not PENDING', () => {
    const a = makeOrder({ id: 'order-a', status: 'PENDING' })
    const b = makeOrder({ id: 'order-b', status: 'VOIDED' })
    expect(validateMerge(a, b, 'store-1')).toMatch(/Target order must be PENDING/)
  })
})

// ─── 5. calcMergedTotal ───────────────────────────────────────────────────────

describe('calcMergedTotal', () => {
  it('sums totals of both orders', () => {
    const a = makeOrder({ total: 60_000 })
    const b = makeOrder({ total: 35_000 })
    expect(calcMergedTotal(a, b)).toBe(95_000)
  })

  it('handles zero-total orders', () => {
    const a = makeOrder({ total: 0 })
    const b = makeOrder({ total: 50_000 })
    expect(calcMergedTotal(a, b)).toBe(50_000)
  })
})
