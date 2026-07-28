/**
 * @module insights-detection
 * Pure detection functions for business anomaly/insight generation.
 * All functions are side-effect-free and exported for unit testing.
 */

export type BusinessInsightType = 'SPIKE' | 'DIP' | 'TREND' | 'MILESTONE' | 'LOW_STOCK'
export type InsightSeverity = 'INFO' | 'WARNING' | 'CRITICAL'

export interface DailyRevenue {
  date: string   // YYYY-MM-DD
  revenue: number
  orderCount: number
}

export interface StockItem {
  id: string
  name: string
  stock: number
  reorderPoint: number
}

export interface DetectedInsight {
  type: BusinessInsightType
  title: string
  description: string
  severity: InsightSeverity
  data: Record<string, unknown>
}

// ─── Spike detection ──────────────────────────────────────────────────────────

/**
 * Detect days where revenue is >= 2x the 7-day rolling average.
 * Uses the 7 days prior to each candidate day as the baseline window.
 */
export function detectSpikes(dailyRevenue: DailyRevenue[]): DetectedInsight[] {
  if (dailyRevenue.length < 2) return []

  const results: DetectedInsight[] = []
  const sorted = [...dailyRevenue].sort((a, b) => a.date.localeCompare(b.date))

  for (let i = 1; i < sorted.length; i++) {
    // Use up to 7 prior days as baseline
    const windowStart = Math.max(0, i - 7)
    const window = sorted.slice(windowStart, i)
    if (window.length === 0) continue

    const avg = window.reduce((s, d) => s + d.revenue, 0) / window.length
    if (avg <= 0) continue

    const day = sorted[i]
    const ratio = day.revenue / avg

    if (ratio >= 2) {
      const pct = Math.round((ratio - 1) * 100)
      results.push({
        type: 'SPIKE',
        title: `Revenue spike on ${day.date}`,
        description: `Revenue was ${pct}% above the 7-day average (${formatCurrency(day.revenue)} vs avg ${formatCurrency(avg)}).`,
        severity: ratio >= 3 ? 'CRITICAL' : 'WARNING',
        data: {
          date: day.date,
          revenue: day.revenue,
          avg,
          ratio,
          percentAboveAvg: pct,
        },
      })
    }
  }

  return results
}

// ─── Dip detection ────────────────────────────────────────────────────────────

/**
 * Detect days where revenue is <= 50% of the 7-day rolling average.
 */
export function detectDips(dailyRevenue: DailyRevenue[]): DetectedInsight[] {
  if (dailyRevenue.length < 2) return []

  const results: DetectedInsight[] = []
  const sorted = [...dailyRevenue].sort((a, b) => a.date.localeCompare(b.date))

  for (let i = 1; i < sorted.length; i++) {
    const windowStart = Math.max(0, i - 7)
    const window = sorted.slice(windowStart, i)
    if (window.length === 0) continue

    const avg = window.reduce((s, d) => s + d.revenue, 0) / window.length
    if (avg <= 0) continue

    const day = sorted[i]
    const ratio = day.revenue / avg

    if (ratio <= 0.5) {
      const pct = Math.round((1 - ratio) * 100)
      results.push({
        type: 'DIP',
        title: `Revenue dip on ${day.date}`,
        description: `Revenue was ${pct}% below the 7-day average (${formatCurrency(day.revenue)} vs avg ${formatCurrency(avg)}).`,
        severity: ratio <= 0.2 ? 'CRITICAL' : 'WARNING',
        data: {
          date: day.date,
          revenue: day.revenue,
          avg,
          ratio,
          percentBelowAvg: pct,
        },
      })
    }
  }

  return results
}

// ─── Trend direction ──────────────────────────────────────────────────────────

export type TrendDirection = 'UP' | 'DOWN' | 'FLAT'

/**
 * Calculate the 7-day trend direction using linear regression slope.
 * Returns UP if slope > threshold, DOWN if slope < -threshold, else FLAT.
 */
export function calcTrendDirection(
  dailyRevenue: DailyRevenue[],
  flatThresholdPct = 5,
): TrendDirection {
  if (dailyRevenue.length < 2) return 'FLAT'

  const sorted = [...dailyRevenue].sort((a, b) => a.date.localeCompare(b.date))
  const recent = sorted.slice(-7)
  if (recent.length < 2) return 'FLAT'

  const n = recent.length
  const xs = recent.map((_, i) => i)
  const ys = recent.map(d => d.revenue)

  const sumX = xs.reduce((a, b) => a + b, 0)
  const sumY = ys.reduce((a, b) => a + b, 0)
  const sumXY = xs.reduce((s, x, i) => s + x * ys[i], 0)
  const sumX2 = xs.reduce((s, x) => s + x * x, 0)

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
  const avgY = sumY / n

  if (avgY === 0) return 'FLAT'

  const slopePct = (slope / avgY) * 100

  if (slopePct > flatThresholdPct) return 'UP'
  if (slopePct < -flatThresholdPct) return 'DOWN'
  return 'FLAT'
}

/**
 * Generate a TREND insight from the last 7 days of revenue data.
 */
export function detectTrend(dailyRevenue: DailyRevenue[]): DetectedInsight | null {
  if (dailyRevenue.length < 4) return null

  const sorted = [...dailyRevenue].sort((a, b) => a.date.localeCompare(b.date))
  const recent = sorted.slice(-7)

  const direction = calcTrendDirection(recent)
  if (direction === 'FLAT') return null

  const first = recent[0].revenue
  const last = recent[recent.length - 1].revenue
  const changePct =
    first === 0 ? 0 : Math.round(((last - first) / first) * 100)
  const absPct = Math.abs(changePct)

  return {
    type: 'TREND',
    title:
      direction === 'UP'
        ? `7-day revenue trending up ${absPct}%`
        : `7-day revenue trending down ${absPct}%`,
    description:
      direction === 'UP'
        ? `Revenue has grown ${absPct}% over the last 7 days. Momentum is positive.`
        : `Revenue has declined ${absPct}% over the last 7 days. Consider running a promotion.`,
    severity:
      direction === 'DOWN'
        ? absPct >= 30
          ? 'CRITICAL'
          : absPct >= 10
            ? 'WARNING'
            : 'INFO'
        : 'INFO',
    data: {
      direction,
      changePct,
      firstDayRevenue: first,
      lastDayRevenue: last,
      days: recent.length,
    },
  }
}

// ─── Milestone detection ──────────────────────────────────────────────────────

export interface MilestoneGoal {
  id: string
  label: string
  targetRevenue: number
}

/**
 * Detect when cumulative revenue crosses a milestone target.
 */
export function detectMilestones(
  cumulativeRevenue: number,
  goals: MilestoneGoal[],
): DetectedInsight[] {
  return goals
    .filter(g => cumulativeRevenue >= g.targetRevenue)
    .map(g => ({
      type: 'MILESTONE' as BusinessInsightType,
      title: `Milestone reached: ${g.label}`,
      description: `Cumulative revenue of ${formatCurrency(cumulativeRevenue)} has surpassed the ${g.label} goal of ${formatCurrency(g.targetRevenue)}. 🎉`,
      severity: 'INFO' as InsightSeverity,
      data: {
        goalId: g.id,
        goalLabel: g.label,
        targetRevenue: g.targetRevenue,
        cumulativeRevenue,
        excessAmount: cumulativeRevenue - g.targetRevenue,
      },
    }))
}

// ─── Low stock detection ──────────────────────────────────────────────────────

/**
 * Detect products below their reorder point.
 */
export function detectLowStock(products: StockItem[]): DetectedInsight[] {
  return products
    .filter(p => p.stock < p.reorderPoint)
    .map(p => {
      const severity: InsightSeverity =
        p.stock === 0 ? 'CRITICAL' : p.stock <= 3 ? 'WARNING' : 'INFO'
      return {
        type: 'LOW_STOCK' as BusinessInsightType,
        title: `Low stock: ${p.name}`,
        description: `Only ${p.stock} unit${p.stock !== 1 ? 's' : ''} remaining (reorder point: ${p.reorderPoint}). Restock soon to avoid stockouts.`,
        severity,
        data: {
          productId: p.id,
          productName: p.name,
          stock: p.stock,
          reorderPoint: p.reorderPoint,
          deficit: p.reorderPoint - p.stock,
        },
      }
    })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  return `Rp ${Math.round(value).toLocaleString('id-ID')}`
}
