// Pure business logic for demand forecasting — no DB deps, fully testable

export type ForecastMethod = 'MOVING_AVG' | 'EXPONENTIAL' | 'LINEAR_TREND'

export interface SalesDataPoint {
  date: string // YYYY-MM-DD
  qty: number
}

export interface ForecastPoint {
  date: string
  predictedQty: number
  confidenceLow: number
  confidenceHigh: number
}

// ── Moving Average ─────────────────────────────────────────────────────────────

/**
 * Calculate simple moving average over the last `windowDays` data points.
 * Returns the average, or 0 if no data.
 */
export function calcMovingAverage(data: SalesDataPoint[], windowDays: number): number {
  if (data.length === 0) return 0
  const window = data.slice(-windowDays)
  const sum = window.reduce((acc, d) => acc + d.qty, 0)
  return sum / window.length
}

/**
 * Project `horizonDays` future daily quantities using moving average.
 */
export function projectMovingAverage(
  data: SalesDataPoint[],
  windowDays: number,
  horizonDays: number,
  fromDate = new Date()
): ForecastPoint[] {
  const avg = calcMovingAverage(data, windowDays)
  const stdDev = calcStdDev(data.slice(-windowDays).map(d => d.qty), avg)
  return buildForecastPoints(avg, stdDev, horizonDays, fromDate)
}

// ── Exponential Smoothing ──────────────────────────────────────────────────────

/**
 * Apply single exponential smoothing.
 * alpha: smoothing factor (0 < alpha < 1). Higher = more weight on recent data.
 * Returns the smoothed forecast for the next period.
 */
export function calcExponentialSmoothing(data: SalesDataPoint[], alpha: number): number {
  if (data.length === 0) return 0
  if (alpha <= 0 || alpha >= 1) throw new Error('alpha must be between 0 and 1 (exclusive)')

  let smoothed = data[0].qty
  for (let i = 1; i < data.length; i++) {
    smoothed = alpha * data[i].qty + (1 - alpha) * smoothed
  }
  return smoothed
}

/**
 * Project `horizonDays` future quantities using exponential smoothing.
 */
export function projectExponentialSmoothing(
  data: SalesDataPoint[],
  alpha: number,
  horizonDays: number,
  fromDate = new Date()
): ForecastPoint[] {
  const forecast = calcExponentialSmoothing(data, alpha)
  const recentWindow = data.slice(-Math.min(data.length, 14))
  const stdDev = calcStdDev(recentWindow.map(d => d.qty), forecast)
  return buildForecastPoints(forecast, stdDev, horizonDays, fromDate)
}

// ── Linear Trend ───────────────────────────────────────────────────────────────

export interface LinearTrendCoeffs {
  slope: number
  intercept: number
}

/**
 * Fit a linear regression (OLS) to the sales data.
 * x = index (0, 1, 2, ...), y = qty
 */
export function calcLinearTrend(data: SalesDataPoint[]): LinearTrendCoeffs {
  const n = data.length
  if (n === 0) return { slope: 0, intercept: 0 }
  if (n === 1) return { slope: 0, intercept: data[0].qty }

  const xMean = (n - 1) / 2
  const yMean = data.reduce((acc, d) => acc + d.qty, 0) / n

  let ssXY = 0
  let ssXX = 0
  for (let i = 0; i < n; i++) {
    ssXY += (i - xMean) * (data[i].qty - yMean)
    ssXX += (i - xMean) ** 2
  }

  const slope = ssXX === 0 ? 0 : ssXY / ssXX
  const intercept = yMean - slope * xMean
  return { slope, intercept }
}

/**
 * Project `horizonDays` future quantities using linear trend extrapolation.
 */
export function projectLinearTrend(
  data: SalesDataPoint[],
  horizonDays: number,
  fromDate = new Date()
): ForecastPoint[] {
  const { slope, intercept } = calcLinearTrend(data)
  const n = data.length

  // Compute residuals for std dev
  const residuals = data.map((d, i) => d.qty - (intercept + slope * i))
  const residualMean = residuals.reduce((a, b) => a + b, 0) / residuals.length
  const stdDev = calcStdDev(residuals, residualMean)

  const points: ForecastPoint[] = []
  for (let i = 0; i < horizonDays; i++) {
    const predicted = Math.max(0, intercept + slope * (n + i))
    const ci = 1.96 * stdDev * Math.sqrt(1 + 1 / n)
    const date = new Date(fromDate)
    date.setDate(date.getDate() + i + 1)
    points.push({
      date: date.toISOString().slice(0, 10),
      predictedQty: Math.round(predicted * 100) / 100,
      confidenceLow: Math.max(0, Math.round((predicted - ci) * 100) / 100),
      confidenceHigh: Math.round((predicted + ci) * 100) / 100,
    })
  }
  return points
}

// ── Accuracy ───────────────────────────────────────────────────────────────────

/**
 * Mean Absolute Percentage Error.
 * actuals and predictions must be same length.
 * Skips periods where actual = 0 to avoid division by zero.
 */
export function calcMAPE(actuals: number[], predictions: number[]): number {
  if (actuals.length === 0) return 0
  const pairs = actuals
    .map((actual, i) => ({ actual, predicted: predictions[i] ?? 0 }))
    .filter(p => p.actual !== 0)
  if (pairs.length === 0) return 0

  const sumPct = pairs.reduce((acc, { actual, predicted }) => {
    return acc + Math.abs((actual - predicted) / actual)
  }, 0)
  return (sumPct / pairs.length) * 100
}

// ── Confidence Intervals ───────────────────────────────────────────────────────

/**
 * Generate a 95% confidence interval around a point forecast.
 * Uses 1.96 * stdDev as the margin.
 */
export function calcConfidenceInterval(
  predicted: number,
  stdDev: number
): { low: number; high: number } {
  const margin = 1.96 * stdDev
  return {
    low: Math.max(0, Math.round((predicted - margin) * 100) / 100),
    high: Math.round((predicted + margin) * 100) / 100,
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

export function calcStdDev(values: number[], mean: number): number {
  if (values.length < 2) return 0
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

function buildForecastPoints(
  dailyQty: number,
  stdDev: number,
  horizonDays: number,
  fromDate: Date
): ForecastPoint[] {
  const points: ForecastPoint[] = []
  for (let i = 0; i < horizonDays; i++) {
    const date = new Date(fromDate)
    date.setDate(date.getDate() + i + 1)
    const ci = calcConfidenceInterval(dailyQty, stdDev)
    points.push({
      date: date.toISOString().slice(0, 10),
      predictedQty: Math.max(0, Math.round(dailyQty * 100) / 100),
      confidenceLow: ci.low,
      confidenceHigh: ci.high,
    })
  }
  return points
}
