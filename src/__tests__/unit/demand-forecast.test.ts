import { describe, it, expect } from 'vitest'
import {
  calcMovingAverage,
  calcExponentialSmoothing,
  calcLinearTrend,
  calcMAPE,
  calcConfidenceInterval,
  calcStdDev,
  projectMovingAverage,
  projectExponentialSmoothing,
  projectLinearTrend,
} from '@/lib/demand-forecast'

// Sample sales data helpers
const makeSales = (qtys: number[]) =>
  qtys.map((qty, i) => ({ date: `2024-01-${String(i + 1).padStart(2, '0')}`, qty }))

describe('Demand Forecast — Moving Average', () => {
  it('should calculate 7-day moving average correctly', () => {
    const data = makeSales([10, 12, 8, 15, 11, 9, 14])
    const avg = calcMovingAverage(data, 7)
    expect(avg).toBeCloseTo((10 + 12 + 8 + 15 + 11 + 9 + 14) / 7, 4)
  })

  it('should use only the last N days when data is longer than window', () => {
    const data = makeSales([100, 100, 100, 10, 20, 30]) // last 3 avg = 20
    const avg = calcMovingAverage(data, 3)
    expect(avg).toBeCloseTo(20, 4)
  })

  it('should return 0 for empty data', () => {
    expect(calcMovingAverage([], 7)).toBe(0)
  })

  it('should project correct number of forecast points', () => {
    const data = makeSales([10, 12, 8, 15, 11, 9, 14])
    const points = projectMovingAverage(data, 7, 14)
    expect(points).toHaveLength(14)
  })

  it('should set predicted qty >= 0 in projections', () => {
    const data = makeSales([2, 1, 3, 0, 2])
    const points = projectMovingAverage(data, 5, 7)
    points.forEach(p => expect(p.predictedQty).toBeGreaterThanOrEqual(0))
  })
})

describe('Demand Forecast — Exponential Smoothing', () => {
  it('should weight recent data more heavily with high alpha', () => {
    // Last value is 100, all prior are 10 — high alpha should pull forecast toward 100
    const data = makeSales([10, 10, 10, 10, 100])
    const highAlpha = calcExponentialSmoothing(data, 0.9)
    const lowAlpha = calcExponentialSmoothing(data, 0.1)
    expect(highAlpha).toBeGreaterThan(lowAlpha)
  })

  it('should return first value when data has one entry', () => {
    const data = makeSales([42])
    expect(calcExponentialSmoothing(data, 0.3)).toBe(42)
  })

  it('should converge to a stable value on flat data', () => {
    const data = makeSales([20, 20, 20, 20, 20, 20, 20])
    const result = calcExponentialSmoothing(data, 0.3)
    expect(result).toBeCloseTo(20, 4)
  })

  it('should throw on invalid alpha (>= 1)', () => {
    expect(() => calcExponentialSmoothing(makeSales([1, 2, 3]), 1.0)).toThrow()
  })

  it('should project correct number of points', () => {
    const data = makeSales([5, 8, 6, 9, 7])
    const points = projectExponentialSmoothing(data, 0.3, 30)
    expect(points).toHaveLength(30)
  })
})

describe('Demand Forecast — Linear Trend', () => {
  it('should fit a positive slope on increasing data', () => {
    const data = makeSales([1, 2, 3, 4, 5])
    const { slope } = calcLinearTrend(data)
    expect(slope).toBeCloseTo(1, 4)
  })

  it('should fit a negative slope on decreasing data', () => {
    const data = makeSales([10, 8, 6, 4, 2])
    const { slope } = calcLinearTrend(data)
    expect(slope).toBeCloseTo(-2, 4)
  })

  it('should return slope 0 and mean as intercept on flat data', () => {
    const data = makeSales([5, 5, 5, 5, 5])
    const { slope, intercept } = calcLinearTrend(data)
    expect(slope).toBeCloseTo(0, 4)
    expect(intercept).toBeCloseTo(5, 4)
  })

  it('should project values that continue the trend', () => {
    const data = makeSales([1, 2, 3, 4, 5])
    const points = projectLinearTrend(data, 3)
    // Next 3 values should be approximately 6, 7, 8
    expect(points[0].predictedQty).toBeCloseTo(6, 0)
    expect(points[1].predictedQty).toBeCloseTo(7, 0)
    expect(points[2].predictedQty).toBeCloseTo(8, 0)
  })

  it('should clamp predicted qty to 0 on steeply declining trend', () => {
    const data = makeSales([100, 50, 10, 1, 0])
    const points = projectLinearTrend(data, 5)
    points.forEach(p => expect(p.predictedQty).toBeGreaterThanOrEqual(0))
  })
})

describe('Demand Forecast — MAPE', () => {
  it('should calculate MAPE correctly for perfect predictions', () => {
    const actuals = [10, 20, 30]
    const predictions = [10, 20, 30]
    expect(calcMAPE(actuals, predictions)).toBe(0)
  })

  it('should calculate MAPE correctly for known error', () => {
    // 100% error on first, 0% on rest → avg 33.33%
    const actuals = [10, 20, 30]
    const predictions = [20, 20, 30]
    expect(calcMAPE(actuals, predictions)).toBeCloseTo(33.33, 1)
  })

  it('should skip periods where actual is 0 (avoid division by zero)', () => {
    const actuals = [0, 10, 20]
    const predictions = [5, 10, 20]
    // Only 2 valid periods, both perfect → MAPE = 0
    expect(calcMAPE(actuals, predictions)).toBe(0)
  })

  it('should return 0 for empty arrays', () => {
    expect(calcMAPE([], [])).toBe(0)
  })
})

describe('Demand Forecast — Confidence Intervals', () => {
  it('should produce symmetric confidence interval around prediction', () => {
    const { low, high } = calcConfidenceInterval(100, 10)
    const margin = 1.96 * 10
    expect(low).toBeCloseTo(100 - margin, 1)
    expect(high).toBeCloseTo(100 + margin, 1)
  })

  it('should clamp low to 0 when stdDev is large relative to prediction', () => {
    const { low } = calcConfidenceInterval(5, 10)
    expect(low).toBe(0)
  })

  it('should return 0,0 for zero prediction and zero stdDev', () => {
    const { low, high } = calcConfidenceInterval(0, 0)
    expect(low).toBe(0)
    expect(high).toBe(0)
  })
})

describe('Demand Forecast — StdDev helper', () => {
  it('should calculate standard deviation correctly', () => {
    // values: [2,4,4,4,5,5,7,9], mean=5, variance=4, stdDev=2
    const values = [2, 4, 4, 4, 5, 5, 7, 9]
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    expect(calcStdDev(values, mean)).toBeCloseTo(2, 4)
  })

  it('should return 0 for single-element array', () => {
    expect(calcStdDev([42], 42)).toBe(0)
  })
})
