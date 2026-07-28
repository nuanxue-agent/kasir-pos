import { describe, it, expect } from 'vitest'
import {
  calcPercentageDiscount,
  calcFixedDiscount,
  calcDiscount,
  calcUsageRate,
  isCouponActive,
  isCouponExpired,
  meetsMinOrder,
  isWithinUsageLimit,
  isWithinPerCustomerLimit,
  validateCoupon,
  type Coupon,
} from '@/lib/coupons'

const baseCoupon = (): Coupon => ({
  id: 'c1',
  storeId: 's1',
  code: 'PROMO20',
  name: 'Diskon 20%',
  discountType: 'PERCENTAGE',
  discountValue: 20,
  minOrderAmount: 50000,
  maxDiscount: null,
  usageLimit: 100,
  usedCount: 10,
  perCustomerLimit: 2,
  segments: [],
  productIds: [],
  categoryIds: [],
  startDate: null,
  endDate: null,
  active: true,
})

// ─── Discount calculation ────────────────────────────────────────────────────

describe('calcPercentageDiscount', () => {
  it('applies percentage correctly', () => {
    expect(calcPercentageDiscount(100000, 20, null)).toBe(20000)
  })

  it('respects maxDiscount cap', () => {
    expect(calcPercentageDiscount(200000, 30, 50000)).toBe(50000)
  })

  it('returns full percentage when under maxDiscount', () => {
    expect(calcPercentageDiscount(100000, 10, 50000)).toBe(10000)
  })
})

describe('calcFixedDiscount', () => {
  it('applies fixed discount correctly', () => {
    expect(calcFixedDiscount(100000, 15000)).toBe(15000)
  })

  it('caps fixed discount at order amount', () => {
    expect(calcFixedDiscount(10000, 20000)).toBe(10000)
  })
})

describe('calcDiscount', () => {
  it('calculates PERCENTAGE discount', () => {
    const c = baseCoupon()
    expect(calcDiscount(c, 100000)).toBe(20000)
  })

  it('calculates FIXED discount', () => {
    const c = { ...baseCoupon(), discountType: 'FIXED' as const, discountValue: 25000 }
    expect(calcDiscount(c, 100000)).toBe(25000)
  })

  it('calculates FREE_SHIPPING as discountValue', () => {
    const c = { ...baseCoupon(), discountType: 'FREE_SHIPPING' as const, discountValue: 15000 }
    expect(calcDiscount(c, 100000)).toBe(15000)
  })

  it('calculates BOGO as 50% of order', () => {
    const c = { ...baseCoupon(), discountType: 'BOGO' as const }
    expect(calcDiscount(c, 100000)).toBe(50000)
  })
})

// ─── Min order validation ────────────────────────────────────────────────────

describe('meetsMinOrder', () => {
  it('passes when order equals minOrderAmount', () => {
    expect(meetsMinOrder(baseCoupon(), 50000)).toBe(true)
  })

  it('passes when order exceeds minOrderAmount', () => {
    expect(meetsMinOrder(baseCoupon(), 75000)).toBe(true)
  })

  it('fails when order is below minOrderAmount', () => {
    expect(meetsMinOrder(baseCoupon(), 30000)).toBe(false)
  })

  it('always passes when minOrderAmount is 0', () => {
    const c = { ...baseCoupon(), minOrderAmount: 0 }
    expect(meetsMinOrder(c, 1)).toBe(true)
  })
})

// ─── Usage limit enforcement ─────────────────────────────────────────────────

describe('isWithinUsageLimit', () => {
  it('allows use when under limit', () => {
    expect(isWithinUsageLimit(baseCoupon())).toBe(true)
  })

  it('blocks use when at limit', () => {
    const c = { ...baseCoupon(), usageLimit: 10, usedCount: 10 }
    expect(isWithinUsageLimit(c)).toBe(false)
  })

  it('blocks use when over limit', () => {
    const c = { ...baseCoupon(), usageLimit: 5, usedCount: 7 }
    expect(isWithinUsageLimit(c)).toBe(false)
  })

  it('always allows use when usageLimit is null', () => {
    const c = { ...baseCoupon(), usageLimit: null, usedCount: 9999 }
    expect(isWithinUsageLimit(c)).toBe(true)
  })
})

// ─── Per-customer limit ──────────────────────────────────────────────────────

describe('isWithinPerCustomerLimit', () => {
  it('allows use when customer has not reached limit', () => {
    expect(isWithinPerCustomerLimit(baseCoupon(), 1)).toBe(true)
  })

  it('blocks use when customer is at their limit', () => {
    expect(isWithinPerCustomerLimit(baseCoupon(), 2)).toBe(false)
  })

  it('allows unlimited use when perCustomerLimit is null', () => {
    const c = { ...baseCoupon(), perCustomerLimit: null }
    expect(isWithinPerCustomerLimit(c, 999)).toBe(true)
  })
})

// ─── Expiry check ────────────────────────────────────────────────────────────

describe('isCouponExpired', () => {
  it('not expired when no dates set', () => {
    expect(isCouponExpired(baseCoupon(), new Date('2025-06-01'))).toBe(false)
  })

  it('expired when past endDate', () => {
    const c = { ...baseCoupon(), endDate: '2025-01-01T00:00:00.000Z' }
    expect(isCouponExpired(c, new Date('2025-06-01'))).toBe(true)
  })

  it('not expired when before endDate', () => {
    const c = { ...baseCoupon(), endDate: '2030-01-01T00:00:00.000Z' }
    expect(isCouponExpired(c, new Date('2025-06-01'))).toBe(false)
  })

  it('expired (not yet started) when before startDate', () => {
    const c = { ...baseCoupon(), startDate: '2030-01-01T00:00:00.000Z' }
    expect(isCouponExpired(c, new Date('2025-06-01'))).toBe(true)
  })
})

// ─── Full validateCoupon ─────────────────────────────────────────────────────

describe('validateCoupon', () => {
  it('returns valid with correct discount for a happy path', () => {
    const result = validateCoupon({
      coupon: baseCoupon(),
      orderAmount: 100000,
      customerId: 'cust1',
      customerUsageCount: 0,
    })
    expect(result.valid).toBe(true)
    expect(result.discount).toBe(20000)
  })

  it('rejects inactive coupon', () => {
    const c = { ...baseCoupon(), active: false }
    const result = validateCoupon({ coupon: c, orderAmount: 100000, customerId: 'c1', customerUsageCount: 0 })
    expect(result.valid).toBe(false)
  })

  it('rejects when below min order', () => {
    const result = validateCoupon({
      coupon: baseCoupon(),
      orderAmount: 10000,
      customerId: 'cust1',
      customerUsageCount: 0,
    })
    expect(result.valid).toBe(false)
    expect(result.reason).toMatch(/minimum/i)
  })

  it('rejects when usage limit exhausted', () => {
    const c = { ...baseCoupon(), usageLimit: 10, usedCount: 10 }
    const result = validateCoupon({ coupon: c, orderAmount: 100000, customerId: 'c1', customerUsageCount: 0 })
    expect(result.valid).toBe(false)
  })

  it('rejects when per-customer limit reached', () => {
    const result = validateCoupon({
      coupon: baseCoupon(),
      orderAmount: 100000,
      customerId: 'cust1',
      customerUsageCount: 2,
    })
    expect(result.valid).toBe(false)
  })
})

// ─── calcUsageRate ───────────────────────────────────────────────────────────

describe('calcUsageRate', () => {
  it('calculates rate correctly', () => {
    expect(calcUsageRate(50, 100)).toBe(0.5)
  })

  it('returns -1 for unlimited (null) usage limit', () => {
    expect(calcUsageRate(999, null)).toBe(-1)
  })

  it('returns -1 for zero usage limit', () => {
    expect(calcUsageRate(0, 0)).toBe(-1)
  })
})
