import { describe, it, expect } from 'vitest'
import {
  calcPercentageOff,
  calcFixedAmount,
  calcBuyXGetY,
  calcCategoryDiscount,
  applyPromotions,
  isPromotionExpired,
  isPromotionMaxedOut,
  meetsMinOrder,
  isPromotionEligible,
  totalDiscount,
  type Promotion,
  type CartItem,
} from '@/lib/promotions-engine'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makePromo(overrides: Partial<Promotion> = {}): Promotion {
  return {
    id: 'promo-1',
    storeId: 'store-1',
    name: 'Test Promo',
    type: 'PERCENTAGE_OFF',
    value: 10,
    conditions: {},
    startDate: null,
    endDate: null,
    maxUses: null,
    usedCount: 0,
    status: 'ACTIVE',
    code: null,
    ...overrides,
  }
}

function makeCart(overrides: Partial<CartItem>[] = []): CartItem[] {
  if (overrides.length === 0) {
    return [
      {
        productId: 'p1',
        name: 'Kopi Susu',
        price: 25000,
        qty: 2,
        subtotal: 50000,
        categoryId: 'cat-beverages',
        categoryName: 'Minuman',
      },
      {
        productId: 'p2',
        name: 'Nasi Goreng',
        price: 35000,
        qty: 1,
        subtotal: 35000,
        categoryId: 'cat-food',
        categoryName: 'Makanan',
      },
    ]
  }
  return overrides.map((o, i) => ({
    productId: `p${i + 1}`,
    name: `Product ${i + 1}`,
    price: 10000,
    qty: 1,
    subtotal: 10000,
    ...o,
  }))
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('promotions-engine', () => {
  // 1. Percentage discount calculation
  it('calcPercentageOff: returns correct amount for 10% off 85000', () => {
    const promo = makePromo({ value: 10 })
    expect(calcPercentageOff(promo, 85000)).toBe(8500)
  })

  // 2. Percentage discount — clamps at 100%
  it('calcPercentageOff: clamps percentage at 100%', () => {
    const promo = makePromo({ value: 150 })
    expect(calcPercentageOff(promo, 50000)).toBe(50000)
  })

  // 3. Fixed amount discount
  it('calcFixedAmount: deducts fixed value from subtotal', () => {
    const promo = makePromo({ type: 'FIXED_AMOUNT', value: 20000 })
    expect(calcFixedAmount(promo, 100000)).toBe(20000)
  })

  // 4. Fixed amount — cannot exceed subtotal
  it('calcFixedAmount: caps discount at subtotal', () => {
    const promo = makePromo({ type: 'FIXED_AMOUNT', value: 200000 })
    expect(calcFixedAmount(promo, 50000)).toBe(50000)
  })

  // 5. BuyXGetY logic — buy 2 get 1 free
  it('calcBuyXGetY: buy 2 get 1 free with 3 identical items', () => {
    const promo = makePromo({
      type: 'BUY_X_GET_Y',
      value: 0,
      conditions: { buyQty: 2, getQty: 1 },
    })
    const cart = makeCart([
      { price: 15000, qty: 3, subtotal: 45000 },
    ])
    // 3 items / (2+1) = 1 set → 1 free item at Rp 15000
    expect(calcBuyXGetY(promo, cart)).toBe(15000)
  })

  // 6. BuyXGetY — no free item when below threshold
  it('calcBuyXGetY: returns 0 when cart has fewer items than buy qty', () => {
    const promo = makePromo({
      type: 'BUY_X_GET_Y',
      value: 0,
      conditions: { buyQty: 3, getQty: 1 },
    })
    const cart = makeCart([{ price: 20000, qty: 2, subtotal: 40000 }])
    expect(calcBuyXGetY(promo, cart)).toBe(0)
  })

  // 7. Category discount filtering — only discounts matching category
  it('calcCategoryDiscount: applies only to matching category items', () => {
    const promo = makePromo({
      type: 'CATEGORY_DISCOUNT',
      value: 15,
      conditions: { categoryName: 'Minuman' },
    })
    const cart = makeCart()
    // Minuman subtotal = 50000, 15% of 50000 = 7500
    expect(calcCategoryDiscount(promo, cart)).toBe(7500)
  })

  // 8. Category discount — no match returns 0
  it('calcCategoryDiscount: returns 0 when no items in category', () => {
    const promo = makePromo({
      type: 'CATEGORY_DISCOUNT',
      value: 20,
      conditions: { categoryName: 'Dessert' },
    })
    const cart = makeCart()
    expect(calcCategoryDiscount(promo, cart)).toBe(0)
  })

  // 9. Min order validation — passes when above threshold
  it('meetsMinOrder: returns true when order meets minimum', () => {
    const promo = makePromo({ conditions: { minOrderAmount: 50000 } })
    expect(meetsMinOrder(promo, 85000)).toBe(true)
  })

  // 10. Min order validation — fails when below threshold
  it('meetsMinOrder: returns false when order is below minimum', () => {
    const promo = makePromo({ conditions: { minOrderAmount: 100000 } })
    expect(meetsMinOrder(promo, 85000)).toBe(false)
  })

  // 11. Expiry check — expired promo is detected
  it('isPromotionExpired: detects past endDate as expired', () => {
    const promo = makePromo({ endDate: '2020-01-01' })
    expect(isPromotionExpired(promo)).toBe(true)
  })

  // 12. Expiry check — future startDate not yet active
  it('isPromotionExpired: treats future startDate as not yet active', () => {
    const futureDate = new Date(Date.now() + 86400000 * 30).toISOString()
    const promo = makePromo({ startDate: futureDate })
    expect(isPromotionExpired(promo)).toBe(true)
  })

  // 13. Expiry check — active promo within date range
  it('isPromotionExpired: returns false for active date range', () => {
    const past = new Date(Date.now() - 86400000).toISOString()
    const future = new Date(Date.now() + 86400000).toISOString()
    const promo = makePromo({ startDate: past, endDate: future })
    expect(isPromotionExpired(promo)).toBe(false)
  })

  // 14. Max uses enforcement — maxed out
  it('isPromotionMaxedOut: returns true when usedCount reaches maxUses', () => {
    const promo = makePromo({ maxUses: 10, usedCount: 10 })
    expect(isPromotionMaxedOut(promo)).toBe(true)
  })

  // 15. applyPromotions — combines eligible promos and skips ineligible
  it('applyPromotions: applies eligible promos and skips expired/inactive', () => {
    const activePromo = makePromo({ id: 'p1', value: 10, type: 'PERCENTAGE_OFF' })
    const expiredPromo = makePromo({ id: 'p2', value: 20, endDate: '2020-01-01' })
    const inactivePromo = makePromo({ id: 'p3', status: 'INACTIVE', value: 50 })
    const cart = makeCart()
    const subtotal = cart.reduce((s, i) => s + i.subtotal, 0) // 85000

    const result = applyPromotions([activePromo, expiredPromo, inactivePromo], cart)
    expect(result).toHaveLength(1)
    expect(result[0].promotionId).toBe('p1')
    expect(result[0].discountAmount).toBe(8500) // 10% of 85000
    expect(totalDiscount(result)).toBe(8500)
  })
})
