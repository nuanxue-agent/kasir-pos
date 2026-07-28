import { describe, it, expect } from 'vitest'

// ── Pure functions mirrored from StockForecastClient ─────────────────────────

function calcAvgDailySales(totalSold: number, periodDays: number): number {
  if (periodDays <= 0) return 0
  return totalSold / periodDays
}

function calcDaysRemaining(currentStock: number, avgDailySales: number): number {
  if (avgDailySales <= 0) return Infinity
  return currentStock / avgDailySales
}

function calcForecastStock(
  currentStock: number,
  avgDailySales: number,
  daysAhead: number,
): number {
  return Math.max(0, currentStock - avgDailySales * daysAhead)
}

function calcSuggestedQty(
  avgDailySales: number,
  leadTimeDays: number,
  safetyStockDays = 7,
): number {
  return Math.ceil(avgDailySales * (leadTimeDays + safetyStockDays))
}

function needsReorder(daysRemaining: number, leadTimeDays: number): boolean {
  return isFinite(daysRemaining) && daysRemaining < leadTimeDays
}

// Forecast accuracy: mean absolute percentage error (MAPE) between predicted and actual
function forecastMAPE(predicted: number[], actual: number[]): number {
  if (predicted.length !== actual.length || predicted.length === 0) return NaN
  const errors = predicted.map((p, i) => {
    if (actual[i] === 0) return 0 // avoid div-by-zero
    return Math.abs((p - actual[i]) / actual[i])
  })
  return errors.reduce((s, e) => s + e, 0) / errors.length
}

// Reorder point: stock level at which to trigger an order
function calcReorderPoint(avgDailySales: number, leadTimeDays: number, safetyStockDays = 7): number {
  return avgDailySales * (leadTimeDays + safetyStockDays)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Sales velocity calculation', () => {
  it('calculates average daily sales correctly over 30 days', () => {
    expect(calcAvgDailySales(300, 30)).toBeCloseTo(10)
  })

  it('returns 0 when period days is 0 (no division by zero)', () => {
    expect(calcAvgDailySales(100, 0)).toBe(0)
  })

  it('handles fractional daily sales', () => {
    // 5 units sold over 30 days = 0.1667/day
    expect(calcAvgDailySales(5, 30)).toBeCloseTo(0.1667, 3)
  })
})

describe('Days remaining computation', () => {
  it('computes days remaining correctly', () => {
    // 200 units stock / 10/day = 20 days
    expect(calcDaysRemaining(200, 10)).toBeCloseTo(20)
  })

  it('returns Infinity when avg daily sales is zero (no demand)', () => {
    expect(calcDaysRemaining(500, 0)).toBe(Infinity)
  })

  it('returns 0 days when stock is 0', () => {
    expect(calcDaysRemaining(0, 5)).toBe(0)
  })
})

describe('Reorder suggestion threshold', () => {
  it('flags product as needing reorder when days remaining < lead time', () => {
    // 5 days remaining, 14-day lead time → needs reorder
    expect(needsReorder(5, 14)).toBe(true)
  })

  it('does not flag when days remaining exceeds lead time', () => {
    expect(needsReorder(30, 14)).toBe(false)
  })

  it('does not flag when stock never runs out (Infinity remaining)', () => {
    expect(needsReorder(Infinity, 14)).toBe(false)
  })

  it('flags exactly at lead time boundary (days === lead time - 1)', () => {
    expect(needsReorder(13, 14)).toBe(true)
  })
})

describe('Suggested quantity calculation (reorder point formula)', () => {
  it('calculates suggested qty covering lead time + safety stock', () => {
    // 10/day * (14 + 7) = 210
    expect(calcSuggestedQty(10, 14, 7)).toBe(210)
  })

  it('rounds up fractional suggested quantity', () => {
    // 0.5/day * (14 + 7) = 10.5 → ceiled to 11
    expect(calcSuggestedQty(0.5, 14, 7)).toBe(11)
  })

  it('calculates reorder point correctly', () => {
    // reorder point = 10/day * (14 + 7) days = 210
    expect(calcReorderPoint(10, 14, 7)).toBeCloseTo(210)
  })

  it('returns 0 suggested qty when avg daily sales is 0', () => {
    expect(calcSuggestedQty(0, 14, 7)).toBe(0)
  })
})

describe('Forecast accuracy metric (MAPE)', () => {
  it('returns 0 MAPE for a perfect forecast', () => {
    expect(forecastMAPE([100, 200, 150], [100, 200, 150])).toBeCloseTo(0)
  })

  it('calculates MAPE correctly for known error', () => {
    // predicted 110, actual 100 → 10% error; average = 10%
    expect(forecastMAPE([110], [100])).toBeCloseTo(0.1)
  })

  it('calculates projected stock at 30 days', () => {
    // 200 stock, 3/day → 200 - 90 = 110
    expect(calcForecastStock(200, 3, 30)).toBeCloseTo(110)
  })

  it('projected stock never goes below zero', () => {
    // 10 stock, 5/day, 30 days ahead → would be -140 but clamped to 0
    expect(calcForecastStock(10, 5, 30)).toBe(0)
  })
})
