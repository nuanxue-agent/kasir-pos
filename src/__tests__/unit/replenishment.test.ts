import { describe, it, expect } from 'vitest'
import {
  calcSalesVelocity,
  calcDaysOfStock,
  isReorderPointBreached,
  calcSuggestedQty,
  classifyUrgency,
  calcExpectedStockout,
} from '@/lib/replenishment'

// ── Sales Velocity ────────────────────────────────────────────────────────────

describe('calcSalesVelocity', () => {
  it('returns average daily qty over the window', () => {
    const data = [
      { date: '2026-06-01', qty: 10 },
      { date: '2026-06-02', qty: 20 },
    ]
    // total 30 / 30 days = 1
    expect(calcSalesVelocity(data, 30)).toBe(1)
  })

  it('returns 0 when there are no sales', () => {
    expect(calcSalesVelocity([], 30)).toBe(0)
  })

  it('returns 0 when windowDays is 0', () => {
    const data = [{ date: '2026-06-01', qty: 10 }]
    expect(calcSalesVelocity(data, 0)).toBe(0)
  })
})

// ── Days of Stock ─────────────────────────────────────────────────────────────

describe('calcDaysOfStock', () => {
  it('divides current stock by daily velocity', () => {
    expect(calcDaysOfStock(90, 3)).toBe(30)
  })

  it('returns Infinity when velocity is 0', () => {
    expect(calcDaysOfStock(100, 0)).toBe(Infinity)
  })

  it('returns 0 when stock is 0', () => {
    expect(calcDaysOfStock(0, 5)).toBe(0)
  })
})

// ── Reorder Point Breach ──────────────────────────────────────────────────────

describe('isReorderPointBreached', () => {
  it('returns true when stock equals reorder point', () => {
    expect(isReorderPointBreached(10, 10)).toBe(true)
  })

  it('returns true when stock is below reorder point', () => {
    expect(isReorderPointBreached(5, 10)).toBe(true)
  })

  it('returns false when stock is above reorder point', () => {
    expect(isReorderPointBreached(15, 10)).toBe(false)
  })
})

// ── Suggested Order Quantity ──────────────────────────────────────────────────

describe('calcSuggestedQty', () => {
  it('uses max-stock formula when maxStock is provided', () => {
    // currentStock=20, maxStock=100 → order 80
    expect(calcSuggestedQty(20, 2, 7, 10, 100)).toBe(80)
  })

  it('returns 0 when stock already at or above maxStock', () => {
    expect(calcSuggestedQty(100, 2, 7, 10, 100)).toBe(0)
  })

  it('falls back to lead-time formula when maxStock is null', () => {
    // velocity=2/day, leadTime=7d, safetyStock=5, currentStock=3
    // leadTimeDemand=14, needed=14+5-3=16
    expect(calcSuggestedQty(3, 2, 7, 5, null)).toBe(16)
  })

  it('never returns a negative quantity', () => {
    expect(calcSuggestedQty(200, 2, 7, 10, 100)).toBe(0)
  })
})

// ── Urgency Classification ────────────────────────────────────────────────────

describe('classifyUrgency', () => {
  it('returns CRITICAL when stock is 0', () => {
    expect(classifyUrgency(0, 7)).toBe('CRITICAL')
  })

  it('returns CRITICAL when days of stock is within lead time', () => {
    // daysOfStock=5, leadTime=7 → within lead time → CRITICAL
    expect(classifyUrgency(5, 7)).toBe('CRITICAL')
  })

  it('returns HIGH when days of stock is within 1.5x lead time', () => {
    // leadTime=7, threshold=10.5 → 9 days ≤ 10.5 → HIGH
    expect(classifyUrgency(9, 7)).toBe('HIGH')
  })

  it('returns MEDIUM when days of stock is within 3x lead time', () => {
    // leadTime=7, threshold=21 → 15 days ≤ 21 → MEDIUM
    expect(classifyUrgency(15, 7)).toBe('MEDIUM')
  })

  it('returns LOW when stock is comfortable', () => {
    // leadTime=7, 3x=21 → 30 days > 21 → LOW
    expect(classifyUrgency(30, 7)).toBe('LOW')
  })
})

// ── Expected Stockout Date ────────────────────────────────────────────────────

describe('calcExpectedStockout', () => {
  it('returns a date string in ISO format', () => {
    const ref = new Date('2026-07-01')
    const result = calcExpectedStockout(10, ref)
    expect(result).toBe('2026-07-11')
  })

  it('returns null when daysOfStock is Infinity', () => {
    expect(calcExpectedStockout(Infinity)).toBeNull()
  })
})
