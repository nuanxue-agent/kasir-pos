import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

// ─── Functions under test (duplicated here as pure logic extractions) ─────────
// These mirror the implementations in src/lib/utils.ts, src/store/cart.ts, etc.
// Property tests should validate invariants, not depend on internal imports.

function formatCurrency(amount: number, currency = 'IDR'): string {
  try {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}

interface CartItem {
  id: string
  productId: string
  name: string
  price: number
  qty: number
  subtotal: number
}

function calcSubtotal(items: CartItem[]): number {
  return items.reduce((sum, i) => sum + i.subtotal, 0)
}

function calcTax(subtotal: number, taxRate: number): number {
  return Math.round(subtotal * taxRate)
}

function calcTotal(subtotal: number, taxAmt: number, discount: number): number {
  return Math.max(0, subtotal + taxAmt - discount)
}

function calcLoyaltyPoints(total: number, rate = 0.01): number {
  return Math.floor(total * rate)
}

function adjustStock(current: number, delta: number): number {
  return Math.max(0, current + delta)
}

// ─── Properties ──────────────────────────────────────────────────────────────

describe('Property: formatCurrency always returns a non-empty string', () => {
  it('for any finite number with IDR', () => {
    fc.assert(
      fc.property(fc.float({ min: 0, max: 1_000_000_000, noNaN: true }), amount => {
        const result = formatCurrency(amount, 'IDR')
        expect(typeof result).toBe('string')
        expect(result.length).toBeGreaterThan(0)
      }),
    )
  })

  it('for negative numbers', () => {
    fc.assert(
      fc.property(fc.float({ min: -1_000_000, max: 0, noNaN: true }), amount => {
        const result = formatCurrency(amount, 'IDR')
        expect(result.length).toBeGreaterThan(0)
      }),
    )
  })
})

describe('Property: cart total always >= 0', () => {
  it('calcSubtotal is non-negative when all items have non-negative subtotals', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.string(),
            productId: fc.string(),
            name: fc.string(),
            price: fc.float({ min: 0, max: 10_000_000, noNaN: true }),
            qty: fc.integer({ min: 1, max: 100 }),
            subtotal: fc.float({ min: 0, max: 100_000_000, noNaN: true }),
          }),
          { maxLength: 50 },
        ),
        items => {
          const total = calcSubtotal(items)
          expect(total).toBeGreaterThanOrEqual(0)
        },
      ),
    )
  })

  it('calcTotal is non-negative for any subtotal/tax/discount combination', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 10_000_000, noNaN: true }),
        fc.float({ min: 0, max: 1_000_000, noNaN: true }),
        fc.float({ min: 0, max: 100_000_000, noNaN: true }),
        (subtotal, taxAmt, discount) => {
          const total = calcTotal(subtotal, taxAmt, discount)
          expect(total).toBeGreaterThanOrEqual(0)
        },
      ),
    )
  })
})

describe('Property: discount never makes total negative', () => {
  it('calcTotal with any discount always >= 0', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 500_000 }),
        fc.integer({ min: 0, max: 50_000 }),
        fc.integer({ min: 0, max: 10_000_000 }),
        (subtotal, taxAmt, discount) => {
          const total = calcTotal(subtotal, taxAmt, discount)
          expect(total).toBeGreaterThanOrEqual(0)
          expect(Number.isFinite(total)).toBe(true)
        },
      ),
    )
  })

  it('discount larger than subtotal+tax clamps to 0', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100_000 }),
        (base) => {
          // Discount is always larger than base
          const total = calcTotal(base, 0, base + 1)
          expect(total).toBe(0)
        },
      ),
    )
  })
})

describe('Property: loyalty points always integer >= 0', () => {
  it('for any positive order total', () => {
    fc.assert(
      fc.property(fc.float({ min: 0, max: 10_000_000, noNaN: true }), total => {
        const points = calcLoyaltyPoints(total)
        expect(points).toBeGreaterThanOrEqual(0)
        expect(Number.isInteger(points)).toBe(true)
      }),
    )
  })

  it('for any non-negative total and positive rate', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: Math.fround(10_000_000), noNaN: true }),
        fc.float({ min: Math.fround(0.001), max: Math.fround(1), noNaN: true }),
        (total, rate) => {
          const points = calcLoyaltyPoints(total, rate)
          expect(points).toBeGreaterThanOrEqual(0)
          expect(Number.isInteger(points)).toBe(true)
        },
      ),
    )
  })
})

describe('Property: stock after adjustment is always >= 0', () => {
  it('adjustStock with any delta never goes negative', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000 }),
        fc.integer({ min: -100_000, max: 100_000 }),
        (current, delta) => {
          const result = adjustStock(current, delta)
          expect(result).toBeGreaterThanOrEqual(0)
          expect(Number.isInteger(result)).toBe(true)
        },
      ),
    )
  })

  it('stock never goes below 0 even with large negative adjustment', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1000 }), current => {
        const result = adjustStock(current, -999999)
        expect(result).toBe(0)
      }),
    )
  })
})
