import { describe, it, expect } from 'vitest'

// ── Types ─────────────────────────────────────────────────────────────────────

type DiscountType = 'PERCENTAGE' | 'FIXED' | 'BOGO'
type AppliesTo = 'ALL' | 'CATEGORY' | 'PRODUCT'

interface HappyHour {
  id: string
  storeId: string
  name: string
  days: number[] // 0=Sunday, 6=Saturday
  startTime: string // HH:MM format
  endTime: string // HH:MM format
  discountType: DiscountType
  discountValue: number
  appliesTo: AppliesTo
  targetIds: string[] // category or product IDs
  active: boolean
}

interface Product {
  id: string
  name: string
  price: number
  categoryId?: string | null
}

// ── Business Logic ────────────────────────────────────────────────────────────

/** True when the happy hour is active AND the current time is within the window */
function isHappyHourActive(hh: HappyHour, now: Date = new Date()): boolean {
  if (!hh.active) return false

  const currentDay = now.getDay()
  if (!hh.days.includes(currentDay)) return false

  const hhmm = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
  return hhmm >= hh.startTime && hhmm < hh.endTime
}

/** Calculate the discounted price */
function calcDiscountedPrice(
  originalPrice: number,
  discountType: DiscountType,
  discountValue: number,
): number {
  if (discountType === 'PERCENTAGE') {
    return Math.round(originalPrice * (1 - discountValue / 100))
  }
  if (discountType === 'FIXED') {
    return Math.max(0, originalPrice - discountValue)
  }
  // BOGO: buy one get one (price for 2 items = price of 1)
  return originalPrice
}

/** True when a product is eligible for a happy hour */
function isProductEligible(product: Product, hh: HappyHour): boolean {
  if (hh.appliesTo === 'ALL') return true
  if (hh.appliesTo === 'CATEGORY' && product.categoryId) {
    return hh.targetIds.includes(product.categoryId)
  }
  if (hh.appliesTo === 'PRODUCT') {
    return hh.targetIds.includes(product.id)
  }
  return false
}

/** Get the best price for a product from all active happy hours */
function getBestPrice(product: Product, happyHours: HappyHour[], now: Date = new Date()): number {
  const activeHH = happyHours.filter(
    hh => isHappyHourActive(hh, now) && isProductEligible(product, hh),
  )

  if (activeHH.length === 0) return product.price

  let bestPrice = product.price
  for (const hh of activeHH) {
    const discountedPrice = calcDiscountedPrice(product.price, hh.discountType, hh.discountValue)
    bestPrice = Math.min(bestPrice, discountedPrice)
  }

  return bestPrice
}

/** Detect overlap: two happy hours overlap when their time ranges and days intersect */
function detectOverlap(a: HappyHour, b: HappyHour): boolean {
  if (a.storeId !== b.storeId) return false

  // Check if they share at least one day
  const sharedDays = a.days.filter(d => b.days.includes(d))
  if (sharedDays.length === 0) return false

  // Check if time ranges intersect (on the same day)
  // a.start < b.end AND b.start < a.end
  return a.startTime < b.endTime && b.startTime < a.endTime
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Happy Hour', () => {
  describe('Active status detection (day + time)', () => {
    it('should be active when day and time match', () => {
      const hh: HappyHour = {
        id: '1',
        storeId: 's1',
        name: 'Evening Happy Hour',
        days: [1, 2, 3, 4, 5], // Mon-Fri
        startTime: '17:00',
        endTime: '19:00',
        discountType: 'PERCENTAGE',
        discountValue: 20,
        appliesTo: 'ALL',
        targetIds: [],
        active: true,
      }

      // Monday 18:00
      const mon18 = new Date('2025-01-06T18:00:00') // Monday
      expect(isHappyHourActive(hh, mon18)).toBe(true)
    })

    it('should not be active when day does not match', () => {
      const hh: HappyHour = {
        id: '1',
        storeId: 's1',
        name: 'Weekday Happy Hour',
        days: [1, 2, 3, 4, 5], // Mon-Fri
        startTime: '17:00',
        endTime: '19:00',
        discountType: 'PERCENTAGE',
        discountValue: 20,
        appliesTo: 'ALL',
        targetIds: [],
        active: true,
      }

      // Saturday 18:00
      const sat18 = new Date('2025-01-04T18:00:00') // Saturday
      expect(isHappyHourActive(hh, sat18)).toBe(false)
    })

    it('should not be active when time is outside window', () => {
      const hh: HappyHour = {
        id: '1',
        storeId: 's1',
        name: 'Evening Happy Hour',
        days: [1, 2, 3, 4, 5],
        startTime: '17:00',
        endTime: '19:00',
        discountType: 'PERCENTAGE',
        discountValue: 20,
        appliesTo: 'ALL',
        targetIds: [],
        active: true,
      }

      // Monday 16:00 (before start)
      const mon16 = new Date('2025-01-06T16:00:00')
      expect(isHappyHourActive(hh, mon16)).toBe(false)

      // Monday 19:00 (at end, exclusive)
      const mon19 = new Date('2025-01-06T19:00:00')
      expect(isHappyHourActive(hh, mon19)).toBe(false)
    })

    it('should not be active when active flag is false', () => {
      const hh: HappyHour = {
        id: '1',
        storeId: 's1',
        name: 'Inactive Happy Hour',
        days: [1, 2, 3, 4, 5],
        startTime: '17:00',
        endTime: '19:00',
        discountType: 'PERCENTAGE',
        discountValue: 20,
        appliesTo: 'ALL',
        targetIds: [],
        active: false,
      }

      const mon18 = new Date('2025-01-06T18:00:00')
      expect(isHappyHourActive(hh, mon18)).toBe(false)
    })
  })

  describe('Discount calculation (%, fixed, BOGO)', () => {
    it('should calculate percentage discount correctly', () => {
      expect(calcDiscountedPrice(100, 'PERCENTAGE', 20)).toBe(80)
      expect(calcDiscountedPrice(150, 'PERCENTAGE', 50)).toBe(75)
      expect(calcDiscountedPrice(99, 'PERCENTAGE', 10)).toBe(89) // rounds
    })

    it('should calculate fixed discount correctly', () => {
      expect(calcDiscountedPrice(100, 'FIXED', 20)).toBe(80)
      expect(calcDiscountedPrice(50, 'FIXED', 15)).toBe(35)
    })

    it('should not allow negative prices with fixed discount', () => {
      expect(calcDiscountedPrice(20, 'FIXED', 30)).toBe(0)
    })

    it('should return original price for BOGO (buy one get one logic)', () => {
      // BOGO means buy 2 for the price of 1, so discount is applied at cart level
      // Here we just return the original price per item
      expect(calcDiscountedPrice(100, 'BOGO', 0)).toBe(100)
    })
  })

  describe('Multiple happy hours overlap handling', () => {
    it('should apply the best (lowest) price when multiple happy hours apply', () => {
      const product: Product = { id: 'p1', name: 'Beer', price: 100 }

      const hh1: HappyHour = {
        id: '1',
        storeId: 's1',
        name: 'HH1',
        days: [1],
        startTime: '17:00',
        endTime: '19:00',
        discountType: 'PERCENTAGE',
        discountValue: 20, // 80
        appliesTo: 'ALL',
        targetIds: [],
        active: true,
      }

      const hh2: HappyHour = {
        id: '2',
        storeId: 's1',
        name: 'HH2',
        days: [1],
        startTime: '17:00',
        endTime: '19:00',
        discountType: 'FIXED',
        discountValue: 30, // 70
        appliesTo: 'ALL',
        targetIds: [],
        active: true,
      }

      const mon18 = new Date('2025-01-06T18:00:00')
      const bestPrice = getBestPrice(product, [hh1, hh2], mon18)
      expect(bestPrice).toBe(70)
    })

    it('should detect overlap when time and days intersect', () => {
      const hh1: HappyHour = {
        id: '1',
        storeId: 's1',
        name: 'HH1',
        days: [1, 2, 3],
        startTime: '17:00',
        endTime: '19:00',
        discountType: 'PERCENTAGE',
        discountValue: 20,
        appliesTo: 'ALL',
        targetIds: [],
        active: true,
      }

      const hh2: HappyHour = {
        id: '2',
        storeId: 's1',
        name: 'HH2',
        days: [2, 3, 4],
        startTime: '18:00',
        endTime: '20:00',
        discountType: 'PERCENTAGE',
        discountValue: 30,
        appliesTo: 'ALL',
        targetIds: [],
        active: true,
      }

      expect(detectOverlap(hh1, hh2)).toBe(true)
    })

    it('should not detect overlap when days do not intersect', () => {
      const hh1: HappyHour = {
        id: '1',
        storeId: 's1',
        name: 'HH1',
        days: [1, 2],
        startTime: '17:00',
        endTime: '19:00',
        discountType: 'PERCENTAGE',
        discountValue: 20,
        appliesTo: 'ALL',
        targetIds: [],
        active: true,
      }

      const hh2: HappyHour = {
        id: '2',
        storeId: 's1',
        name: 'HH2',
        days: [5, 6],
        startTime: '17:00',
        endTime: '19:00',
        discountType: 'PERCENTAGE',
        discountValue: 30,
        appliesTo: 'ALL',
        targetIds: [],
        active: true,
      }

      expect(detectOverlap(hh1, hh2)).toBe(false)
    })
  })

  describe('Day of week filtering', () => {
    it('should only apply on specified days', () => {
      const hh: HappyHour = {
        id: '1',
        storeId: 's1',
        name: 'Weekend Special',
        days: [0, 6], // Sun, Sat
        startTime: '12:00',
        endTime: '14:00',
        discountType: 'PERCENTAGE',
        discountValue: 30,
        appliesTo: 'ALL',
        targetIds: [],
        active: true,
      }

      const sat13 = new Date('2025-01-04T13:00:00') // Saturday
      expect(isHappyHourActive(hh, sat13)).toBe(true)

      const mon13 = new Date('2025-01-06T13:00:00') // Monday
      expect(isHappyHourActive(hh, mon13)).toBe(false)
    })
  })

  describe('Target product/category filtering', () => {
    it('should apply to all products when appliesTo is ALL', () => {
      const hh: HappyHour = {
        id: '1',
        storeId: 's1',
        name: 'All Products',
        days: [1],
        startTime: '17:00',
        endTime: '19:00',
        discountType: 'PERCENTAGE',
        discountValue: 20,
        appliesTo: 'ALL',
        targetIds: [],
        active: true,
      }

      const product: Product = { id: 'p1', name: 'Beer', price: 100 }
      expect(isProductEligible(product, hh)).toBe(true)
    })

    it('should apply only to specific categories when appliesTo is CATEGORY', () => {
      const hh: HappyHour = {
        id: '1',
        storeId: 's1',
        name: 'Drinks Only',
        days: [1],
        startTime: '17:00',
        endTime: '19:00',
        discountType: 'PERCENTAGE',
        discountValue: 20,
        appliesTo: 'CATEGORY',
        targetIds: ['cat1', 'cat2'],
        active: true,
      }

      const beer: Product = { id: 'p1', name: 'Beer', price: 100, categoryId: 'cat1' }
      const fries: Product = { id: 'p2', name: 'Fries', price: 50, categoryId: 'cat3' }

      expect(isProductEligible(beer, hh)).toBe(true)
      expect(isProductEligible(fries, hh)).toBe(false)
    })

    it('should apply only to specific products when appliesTo is PRODUCT', () => {
      const hh: HappyHour = {
        id: '1',
        storeId: 's1',
        name: 'Beer Special',
        days: [1],
        startTime: '17:00',
        endTime: '19:00',
        discountType: 'PERCENTAGE',
        discountValue: 20,
        appliesTo: 'PRODUCT',
        targetIds: ['p1', 'p2'],
        active: true,
      }

      const beer: Product = { id: 'p1', name: 'Beer', price: 100 }
      const wine: Product = { id: 'p3', name: 'Wine', price: 150 }

      expect(isProductEligible(beer, hh)).toBe(true)
      expect(isProductEligible(wine, hh)).toBe(false)
    })

    it('should not apply category filter when product has no category', () => {
      const hh: HappyHour = {
        id: '1',
        storeId: 's1',
        name: 'Category Filter',
        days: [1],
        startTime: '17:00',
        endTime: '19:00',
        discountType: 'PERCENTAGE',
        discountValue: 20,
        appliesTo: 'CATEGORY',
        targetIds: ['cat1'],
        active: true,
      }

      const product: Product = { id: 'p1', name: 'Misc', price: 100 }
      expect(isProductEligible(product, hh)).toBe(false)
    })
  })
})
