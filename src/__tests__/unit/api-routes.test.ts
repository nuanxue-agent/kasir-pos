import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock src/lib/db so no real network calls are made ─────────────────────────
vi.mock('@/lib/db', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  exec: vi.fn(),
  batchExec: vi.fn(),
  newId: () => 'test-id-123',
  nowISO: () => '2025-01-01T00:00:00.000Z',
}))

// ── Pure business-logic helpers (extracted from API route files) ───────────────
// These mirror the calculations done server-side without needing HTTP.

const GST_RATE = 0.11 // 11% GST

function calcOrderSubtotal(items: { price: number; qty: number }[]): number {
  return items.reduce((sum, i) => sum + i.price * i.qty, 0)
}

function applyPercentDiscount(subtotal: number, pct: number): number {
  if (pct < 0 || pct > 100) throw new RangeError('discount percent must be 0–100')
  return Math.round(subtotal * (pct / 100))
}

function applyFixedDiscount(subtotal: number, fixed: number): number {
  return Math.max(0, Math.min(subtotal, fixed))
}

function calcTax(subtotal: number, discountAmt: number, taxRate: number): number {
  return Math.round((subtotal - discountAmt) * taxRate)
}

function calcOrderTotal(subtotal: number, discountAmt: number, taxAmt: number): number {
  return Math.max(0, subtotal - discountAmt + taxAmt)
}

function calcChange(paid: number, total: number): number {
  return Math.max(0, paid - total)
}

function decrementStock(
  current: number,
  qty: number,
): { ok: boolean; newStock: number; error?: string } {
  if (qty <= 0) return { ok: false, newStock: current, error: 'qty must be positive' }
  if (current < qty) return { ok: false, newStock: current, error: 'insufficient stock' }
  return { ok: true, newStock: current - qty }
}

function restoreStock(current: number, qty: number): number {
  if (qty <= 0) return current
  return current + qty
}

function validateOrderItems(items: { productId: string; qty: number; price: number }[]): {
  valid: boolean
  error?: string
} {
  if (!items || items.length === 0)
    return { valid: false, error: 'order must have at least one item' }
  for (const item of items) {
    if (!item.productId) return { valid: false, error: 'productId is required' }
    if (item.qty <= 0) return { valid: false, error: 'qty must be positive' }
    if (item.price < 0) return { valid: false, error: 'price cannot be negative' }
  }
  return { valid: true }
}

function buildOrderRecord(params: {
  id: string
  storeId: string
  cashierId: string
  items: { productId: string; qty: number; price: number }[]
  discountAmt: number
  taxRate: number
  paid: number
  paymentMethod: string
}) {
  const subtotal = calcOrderSubtotal(params.items)
  const taxAmt = calcTax(subtotal, params.discountAmt, params.taxRate)
  const total = calcOrderTotal(subtotal, params.discountAmt, taxAmt)
  const change = calcChange(params.paid, total)
  return {
    id: params.id,
    storeId: params.storeId,
    cashierId: params.cashierId,
    subtotal,
    discountAmt: params.discountAmt,
    taxAmt,
    total,
    paid: params.paid,
    change,
    paymentMethod: params.paymentMethod,
  }
}

// ── Order total calculation ────────────────────────────────────────────────────

describe('Order total calculation', () => {
  it('sums single item correctly', () => {
    expect(calcOrderSubtotal([{ price: 25000, qty: 1 }])).toBe(25000)
  })

  it('sums multiple items correctly', () => {
    const items = [
      { price: 15000, qty: 2 },
      { price: 25000, qty: 1 },
      { price: 5000, qty: 3 },
    ]
    expect(calcOrderSubtotal(items)).toBe(70000) // 15000×2 + 25000×1 + 5000×3
  })

  it('returns 0 for empty item list', () => {
    expect(calcOrderSubtotal([])).toBe(0)
  })

  it('handles fractional prices (cents)', () => {
    expect(calcOrderSubtotal([{ price: 1.5, qty: 4 }])).toBe(6)
  })

  it('calcOrderTotal assembles subtotal, discount, tax correctly', () => {
    const total = calcOrderTotal(100000, 10000, 9900) // 100k - 10k + 9.9k tax
    expect(total).toBe(99900)
  })

  it('calcOrderTotal never returns negative', () => {
    expect(calcOrderTotal(10000, 50000, 0)).toBe(0)
  })

  it('buildOrderRecord produces correct totals end-to-end', () => {
    const rec = buildOrderRecord({
      id: 'ord-1',
      storeId: 'store-1',
      cashierId: 'user-1',
      items: [{ productId: 'p1', qty: 2, price: 50000 }],
      discountAmt: 0,
      taxRate: GST_RATE,
      paid: 120000,
      paymentMethod: 'Cash',
    })
    // subtotal = 100000, tax = 11000, total = 111000, change = 9000
    expect(rec.subtotal).toBe(100000)
    expect(rec.taxAmt).toBe(11000)
    expect(rec.total).toBe(111000)
    expect(rec.change).toBe(9000)
  })
})

// ── Discount application ──────────────────────────────────────────────────────

describe('Discount application', () => {
  it('applies 10% percent discount correctly', () => {
    expect(applyPercentDiscount(100000, 10)).toBe(10000)
  })

  it('applies 100% discount = full subtotal', () => {
    expect(applyPercentDiscount(50000, 100)).toBe(50000)
  })

  it('applies 0% discount = 0', () => {
    expect(applyPercentDiscount(80000, 0)).toBe(0)
  })

  it('throws on negative discount percent', () => {
    expect(() => applyPercentDiscount(50000, -5)).toThrow(RangeError)
  })

  it('throws on discount percent > 100', () => {
    expect(() => applyPercentDiscount(50000, 110)).toThrow(RangeError)
  })

  it('applies fixed discount up to subtotal limit', () => {
    expect(applyFixedDiscount(100000, 20000)).toBe(20000)
  })

  it('caps fixed discount at subtotal (no negative total)', () => {
    expect(applyFixedDiscount(10000, 99999)).toBe(10000)
  })

  it('fixed discount of 0 returns 0', () => {
    expect(applyFixedDiscount(50000, 0)).toBe(0)
  })
})

// ── Tax calculation (11% GST) ─────────────────────────────────────────────────

describe('Tax calculation (11% GST)', () => {
  it('calculates 11% GST on round number', () => {
    expect(calcTax(100000, 0, GST_RATE)).toBe(11000)
  })

  it('calculates GST after discount is applied', () => {
    // 100000 - 10000 discount = 90000 taxable base
    expect(calcTax(100000, 10000, GST_RATE)).toBe(9900)
  })

  it('GST on 0 base = 0', () => {
    expect(calcTax(0, 0, GST_RATE)).toBe(0)
  })

  it('GST rounds fractional amounts', () => {
    // 33333 × 0.11 = 3666.63 → rounds to 3667
    expect(calcTax(33333, 0, GST_RATE)).toBe(3667)
  })

  it('tax rate 0 always produces 0 tax', () => {
    expect(calcTax(500000, 0, 0)).toBe(0)
  })

  it('full discount zeroes out tax base', () => {
    expect(calcTax(50000, 50000, GST_RATE)).toBe(0)
  })

  it('calcChange is correct after GST-inclusive total', () => {
    const subtotal = 100000
    const tax = calcTax(subtotal, 0, GST_RATE) // 11000
    const total = calcOrderTotal(subtotal, 0, tax) // 111000
    expect(calcChange(150000, total)).toBe(39000)
  })
})

// ── Stock decrement on order ──────────────────────────────────────────────────

describe('Stock decrement on order', () => {
  it('decrements stock by ordered qty', () => {
    const result = decrementStock(50, 3)
    expect(result.ok).toBe(true)
    expect(result.newStock).toBe(47)
  })

  it('allows decrement to exactly zero', () => {
    const result = decrementStock(5, 5)
    expect(result.ok).toBe(true)
    expect(result.newStock).toBe(0)
  })

  it('rejects decrement when stock is insufficient', () => {
    const result = decrementStock(2, 5)
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/insufficient/i)
  })

  it('rejects zero qty', () => {
    const result = decrementStock(10, 0)
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/positive/i)
  })

  it('rejects negative qty', () => {
    const result = decrementStock(10, -1)
    expect(result.ok).toBe(false)
  })

  it('stock = 0 with qty > 0 is rejected', () => {
    const result = decrementStock(0, 1)
    expect(result.ok).toBe(false)
  })
})

// ── Refund stock restoration ──────────────────────────────────────────────────

describe('Refund stock restoration', () => {
  it('restores stock after refund', () => {
    expect(restoreStock(10, 3)).toBe(13)
  })

  it('restores from zero stock (lost item returned)', () => {
    expect(restoreStock(0, 5)).toBe(5)
  })

  it('restoring 0 qty is a no-op', () => {
    expect(restoreStock(20, 0)).toBe(20)
  })

  it('ignores negative restore qty', () => {
    expect(restoreStock(20, -3)).toBe(20)
  })

  it('full order refund restores all items correctly', () => {
    const items = [
      { productId: 'p1', stock: 5, qty: 2 },
      { productId: 'p2', stock: 0, qty: 1 },
    ]
    const restored = items.map(i => ({ ...i, stock: restoreStock(i.stock, i.qty) }))
    expect(restored[0].stock).toBe(7)
    expect(restored[1].stock).toBe(1)
  })
})

// ── Order item validation ─────────────────────────────────────────────────────

describe('Order item validation', () => {
  it('rejects empty items array', () => {
    expect(validateOrderItems([]).valid).toBe(false)
  })

  it('rejects item with qty = 0', () => {
    expect(validateOrderItems([{ productId: 'p1', qty: 0, price: 5000 }]).valid).toBe(false)
  })

  it('rejects item with negative qty', () => {
    expect(validateOrderItems([{ productId: 'p1', qty: -1, price: 5000 }]).valid).toBe(false)
  })

  it('rejects item with negative price', () => {
    expect(validateOrderItems([{ productId: 'p1', qty: 1, price: -100 }]).valid).toBe(false)
  })

  it('rejects item missing productId', () => {
    expect(validateOrderItems([{ productId: '', qty: 1, price: 5000 }]).valid).toBe(false)
  })

  it('accepts valid single item', () => {
    expect(validateOrderItems([{ productId: 'p1', qty: 1, price: 15000 }]).valid).toBe(true)
  })

  it('accepts multiple valid items', () => {
    const items = [
      { productId: 'p1', qty: 2, price: 15000 },
      { productId: 'p2', qty: 1, price: 25000 },
    ]
    expect(validateOrderItems(items).valid).toBe(true)
  })
})
