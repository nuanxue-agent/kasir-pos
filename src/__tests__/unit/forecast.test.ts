import { describe, it, expect } from 'vitest'
import {
  movingAverage,
  linearRegression,
  forecastLinear,
  confidenceBounds,
  calcCLV,
} from '@/components/reports/SalesForecastClient'

// ── Moving average ────────────────────────────────────────────────────────────

describe('movingAverage', () => {
  it('returns correct 7-day MA for a flat series', () => {
    const values = Array(10).fill(100)
    const ma = movingAverage(values, 7)
    // First 6 values are 0 (not enough window), rest should be 100
    expect(ma[6]).toBe(100)
    expect(ma[9]).toBe(100)
  })

  it('returns correct 3-day MA for a known series', () => {
    // [1, 2, 3, 4, 5] with window=3
    // index 2 → (1+2+3)/3 = 2, index 4 → (3+4+5)/3 = 4
    const ma = movingAverage([1, 2, 3, 4, 5], 3)
    expect(ma[2]).toBeCloseTo(2)
    expect(ma[4]).toBeCloseTo(4)
  })

  it('pads with 0 for indices before the window fills', () => {
    const ma = movingAverage([10, 20, 30], 7)
    expect(ma[0]).toBe(0)
    expect(ma[1]).toBe(0)
  })
})

// ── Linear regression ─────────────────────────────────────────────────────────

describe('linearRegression', () => {
  it('returns slope=0 and intercept=mean for a flat series', () => {
    const { slope, intercept } = linearRegression([5, 5, 5, 5, 5])
    expect(slope).toBeCloseTo(0)
    expect(intercept).toBeCloseTo(5)
  })

  it('computes exact slope for a perfectly linear series', () => {
    // y = 2x + 1  →  [1, 3, 5, 7, 9]
    const { slope, intercept } = linearRegression([1, 3, 5, 7, 9])
    expect(slope).toBeCloseTo(2)
    expect(intercept).toBeCloseTo(1)
  })

  it('returns slope=0 and intercept=0 for an empty array', () => {
    const { slope, intercept } = linearRegression([])
    expect(slope).toBe(0)
    expect(intercept).toBe(0)
  })

  it('handles a single value without throwing', () => {
    const { slope, intercept } = linearRegression([42])
    expect(slope).toBe(0)
    expect(intercept).toBe(42)
  })
})

// ── Forecast (linear extrapolation) ──────────────────────────────────────────

describe('forecastLinear', () => {
  it('predicts correct next values for a rising series', () => {
    // y = x, values [0,1,2,3,4] — next 3 should be ~[5,6,7]
    const next = forecastLinear([0, 1, 2, 3, 4], 3)
    expect(next[0]).toBeCloseTo(5, 0)
    expect(next[1]).toBeCloseTo(6, 0)
    expect(next[2]).toBeCloseTo(7, 0)
  })

  it('never returns negative values', () => {
    // Steeply falling series — clamps to 0
    const next = forecastLinear([1000, 500, 100, 50, 10], 5)
    for (const v of next) {
      expect(v).toBeGreaterThanOrEqual(0)
    }
  })
})

// ── Confidence interval bounds ────────────────────────────────────────────────

describe('confidenceBounds', () => {
  it('lower is value*(1-pct) and upper is value*(1+pct) at default 15%', () => {
    const { lower, upper } = confidenceBounds(100)
    expect(lower).toBeCloseTo(85)
    expect(upper).toBeCloseTo(115)
  })

  it('lower is never negative', () => {
    const { lower } = confidenceBounds(5, 0.9)
    expect(lower).toBeGreaterThanOrEqual(0)
  })

  it('respects a custom pct', () => {
    const { lower, upper } = confidenceBounds(200, 0.1)
    expect(lower).toBeCloseTo(180)
    expect(upper).toBeCloseTo(220)
  })
})

// ── CLV calculation ───────────────────────────────────────────────────────────

describe('calcCLV', () => {
  it('returns avgOrderValue × avgOrdersPerMonth × avgMonthsActive', () => {
    // 100_000 × 4 × 12 = 4_800_000
    expect(calcCLV(100_000, 4, 12)).toBe(4_800_000)
  })

  it('returns 0 when any factor is 0', () => {
    expect(calcCLV(0, 4, 12)).toBe(0)
    expect(calcCLV(100_000, 0, 12)).toBe(0)
    expect(calcCLV(100_000, 4, 0)).toBe(0)
  })
})

// ── Cohort bucketing helpers ──────────────────────────────────────────────────

describe('cohort bucketing', () => {
  // Pure helper that mirrors the server-side cohort logic
  function toCohortMonth(isoDate: string): string {
    return isoDate.slice(0, 7) // "2024-03-15" → "2024-03"
  }

  function monthOffset(cohort: string, purchaseMonth: string): number {
    const [cy, cm] = cohort.split('-').map(Number)
    const [py, pm] = purchaseMonth.split('-').map(Number)
    return (py - cy) * 12 + (pm - cm)
  }

  it('extracts cohort month from ISO date string', () => {
    expect(toCohortMonth('2024-03-15T10:00:00Z')).toBe('2024-03')
  })

  it('computes month offset 0 for same month', () => {
    expect(monthOffset('2024-03', '2024-03')).toBe(0)
  })

  it('computes month offset 1 for next month', () => {
    expect(monthOffset('2024-03', '2024-04')).toBe(1)
  })

  it('computes month offset correctly across year boundary', () => {
    expect(monthOffset('2023-11', '2024-02')).toBe(3)
  })
})
