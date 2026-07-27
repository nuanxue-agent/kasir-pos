import { describe, it, expect } from 'vitest'

// ─── Types (mirrors OrderManagementClient) ────────────────────────────────────

type OrderStatus = 'PENDING' | 'PAID' | 'VOIDED' | 'REFUNDED'

interface OrderItem {
  id: string
  productId: string
  name: string
  price: number
  qty: number
  discount: number
  subtotal: number
}

interface Order {
  id: string
  number: string
  status: OrderStatus
  subtotal: number
  discountAmt: number
  taxAmt: number
  total: number
  items: OrderItem[]
}

// ─── Pure business logic (mirrors API route behaviour) ────────────────────────

/** Whether an order can be voided (only PENDING). */
function canVoid(order: Order): boolean {
  return order.status === 'PENDING'
}

/** Whether an order can be refunded (only PAID). */
function canRefund(order: Order): boolean {
  return order.status === 'PAID'
}

/** Valid status transitions from a given status. */
function allowedTransitions(status: OrderStatus): OrderStatus[] {
  switch (status) {
    case 'PENDING':
      return ['PAID', 'VOIDED']
    case 'PAID':
      return ['REFUNDED', 'VOIDED']
    case 'VOIDED':
      return []
    case 'REFUNDED':
      return []
  }
}

/** Whether a transition is valid. */
function isValidTransition(from: OrderStatus, to: OrderStatus): boolean {
  return allowedTransitions(from).includes(to)
}

/**
 * Compute the refund amount for a full refund.
 * Returns order.total (all items + tax - discount).
 */
function calcFullRefundAmount(order: Order): number {
  return order.total
}

/**
 * Compute the refund amount for a partial refund.
 * For each refunded item, refund qty * (subtotal / qty) to get unit net price.
 * Tax is prorated proportionally to the partial subtotal vs. order subtotal.
 */
function calcPartialRefundAmount(
  order: Order,
  refundItems: { id: string; qty: number }[],
): number {
  const refundMap = new Map(refundItems.map(r => [r.id, r.qty]))
  let partialSubtotal = 0

  for (const item of order.items) {
    const qty = refundMap.get(item.id) ?? 0
    if (qty <= 0) continue
    const unitNet = item.subtotal / item.qty
    partialSubtotal += unitNet * qty
  }

  if (order.subtotal === 0) return partialSubtotal

  // Prorate tax & discount proportionally
  const ratio = partialSubtotal / order.subtotal
  const proratedTax = order.taxAmt * ratio
  const proratedDiscount = order.discountAmt * ratio
  return Math.round(partialSubtotal + proratedTax - proratedDiscount)
}

/**
 * Compute how much stock to restore for a refund.
 * Returns a map of productId → qty to restore.
 */
function calcStockRestoration(
  items: OrderItem[],
  refundItems?: { id: string; qty: number }[],
): Map<string, number> {
  const result = new Map<string, number>()
  if (!refundItems) {
    // full refund — restore all
    for (const item of items) {
      result.set(item.productId, (result.get(item.productId) ?? 0) + item.qty)
    }
  } else {
    const refundMap = new Map(refundItems.map(r => [r.id, r.qty]))
    for (const item of items) {
      const qty = refundMap.get(item.id) ?? 0
      if (qty > 0) {
        result.set(item.productId, (result.get(item.productId) ?? 0) + qty)
      }
    }
  }
  return result
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'ord-1',
    number: 'INV-0001',
    status: 'PAID',
    subtotal: 100_000,
    discountAmt: 0,
    taxAmt: 10_000,
    total: 110_000,
    items: [
      {
        id: 'item-1',
        productId: 'prod-1',
        name: 'Kopi Susu',
        price: 25_000,
        qty: 2,
        discount: 0,
        subtotal: 50_000,
      },
      {
        id: 'item-2',
        productId: 'prod-2',
        name: 'Croissant',
        price: 50_000,
        qty: 1,
        discount: 0,
        subtotal: 50_000,
      },
    ],
    ...overrides,
  }
}

// ─── Refund calculation ───────────────────────────────────────────────────────

describe('Refund calculation — full refund', () => {
  it('returns order.total for a full refund', () => {
    const order = makeOrder()
    expect(calcFullRefundAmount(order)).toBe(110_000)
  })

  it('returns 0 for a zero-total order', () => {
    const order = makeOrder({ total: 0, subtotal: 0, taxAmt: 0 })
    expect(calcFullRefundAmount(order)).toBe(0)
  })
})

describe('Refund calculation — partial refund', () => {
  it('calculates partial refund for one item', () => {
    const order = makeOrder()
    // refund 1 Kopi Susu (25,000 of 50,000 subtotal = 50 %)
    const result = calcPartialRefundAmount(order, [{ id: 'item-1', qty: 1 }])
    // partialSubtotal = 25000, ratio = 0.25, prorated tax = 2500 → 27500
    expect(result).toBe(27_500)
  })

  it('calculates partial refund for full qty of one item', () => {
    const order = makeOrder()
    // refund 2 Kopi Susu = full 50,000 subtotal
    const result = calcPartialRefundAmount(order, [{ id: 'item-1', qty: 2 }])
    // ratio = 0.5, prorated tax = 5000 → 55000
    expect(result).toBe(55_000)
  })

  it('returns 0 when no items are selected for partial refund', () => {
    const order = makeOrder()
    const result = calcPartialRefundAmount(order, [])
    expect(result).toBe(0)
  })

  it('ignores items with qty 0 in partial refund', () => {
    const order = makeOrder()
    const result = calcPartialRefundAmount(order, [
      { id: 'item-1', qty: 0 },
      { id: 'item-2', qty: 0 },
    ])
    expect(result).toBe(0)
  })
})

// ─── Order status transitions ─────────────────────────────────────────────────

describe('Order status transitions', () => {
  it('PENDING → PAID is valid', () => {
    expect(isValidTransition('PENDING', 'PAID')).toBe(true)
  })

  it('PENDING → VOIDED is valid', () => {
    expect(isValidTransition('PENDING', 'VOIDED')).toBe(true)
  })

  it('PAID → REFUNDED is valid', () => {
    expect(isValidTransition('PAID', 'REFUNDED')).toBe(true)
  })

  it('PAID → VOIDED is valid', () => {
    expect(isValidTransition('PAID', 'VOIDED')).toBe(true)
  })

  it('VOIDED → anything is invalid', () => {
    expect(isValidTransition('VOIDED', 'PAID')).toBe(false)
    expect(isValidTransition('VOIDED', 'REFUNDED')).toBe(false)
  })

  it('REFUNDED → anything is invalid', () => {
    expect(isValidTransition('REFUNDED', 'PAID')).toBe(false)
    expect(isValidTransition('REFUNDED', 'VOIDED')).toBe(false)
  })
})

// ─── Stock restoration on refund ──────────────────────────────────────────────

describe('Stock restoration on refund', () => {
  it('restores full qty for all items on full refund', () => {
    const order = makeOrder()
    const map = calcStockRestoration(order.items)
    expect(map.get('prod-1')).toBe(2)
    expect(map.get('prod-2')).toBe(1)
  })

  it('restores only partial qty on partial refund', () => {
    const order = makeOrder()
    const map = calcStockRestoration(order.items, [{ id: 'item-1', qty: 1 }])
    expect(map.get('prod-1')).toBe(1)
    expect(map.has('prod-2')).toBe(false)
  })

  it('restores nothing when refund qty is 0', () => {
    const order = makeOrder()
    const map = calcStockRestoration(order.items, [{ id: 'item-1', qty: 0 }])
    expect(map.size).toBe(0)
  })
})

// ─── Void eligibility ─────────────────────────────────────────────────────────

describe('Void eligibility', () => {
  it('PENDING order can be voided', () => {
    expect(canVoid(makeOrder({ status: 'PENDING' }))).toBe(true)
  })

  it('PAID order cannot be voided directly', () => {
    expect(canVoid(makeOrder({ status: 'PAID' }))).toBe(false)
  })

  it('VOIDED order cannot be voided again', () => {
    expect(canVoid(makeOrder({ status: 'VOIDED' }))).toBe(false)
  })

  it('REFUNDED order cannot be voided', () => {
    expect(canVoid(makeOrder({ status: 'REFUNDED' }))).toBe(false)
  })

  it('only PAID order can be refunded', () => {
    expect(canRefund(makeOrder({ status: 'PAID' }))).toBe(true)
    expect(canRefund(makeOrder({ status: 'PENDING' }))).toBe(false)
    expect(canRefund(makeOrder({ status: 'VOIDED' }))).toBe(false)
    expect(canRefund(makeOrder({ status: 'REFUNDED' }))).toBe(false)
  })
})
