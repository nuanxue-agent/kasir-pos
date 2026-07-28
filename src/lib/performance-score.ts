/**
 * @module performance-score
 * Pure business logic for employee performance scoring.
 * No DB or Next.js imports — fully testable.
 */

export type BadgeTier = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM'

export interface ScoreWeights {
  sales: number        // 0–1, must sum to 1 with others
  attendance: number
  customer: number
}

export const DEFAULT_WEIGHTS: ScoreWeights = {
  sales: 0.4,
  attendance: 0.35,
  customer: 0.25,
}

export interface ScoreComponents {
  salesScore: number      // 0–100
  attendanceScore: number // 0–100
  customerScore: number   // 0–100
}

/**
 * Clamp a value to [0, 100].
 */
export function normalizeScore(value: number): number {
  return Math.min(100, Math.max(0, value))
}

/**
 * Weighted average of three KPI components.
 * Each score is clamped to [0, 100] before weighting.
 */
export function calcOverallScore(
  components: ScoreComponents,
  weights: ScoreWeights = DEFAULT_WEIGHTS,
): number {
  const s = normalizeScore(components.salesScore)
  const a = normalizeScore(components.attendanceScore)
  const c = normalizeScore(components.customerScore)
  return Math.round(s * weights.sales + a * weights.attendance + c * weights.customer)
}

/**
 * Assign badge tier based on overall score.
 *   PLATINUM: 90–100
 *   GOLD:     75–89
 *   SILVER:   60–74
 *   BRONZE:   0–59
 */
export function calcBadge(overallScore: number): BadgeTier {
  const s = normalizeScore(overallScore)
  if (s >= 90) return 'PLATINUM'
  if (s >= 75) return 'GOLD'
  if (s >= 60) return 'SILVER'
  return 'BRONZE'
}

export interface RankedEntry {
  employeeId: string
  overallScore: number
  salesScore: number
}

/**
 * Assign rank 1-based, sorted by overallScore DESC then salesScore DESC (tie-breaker).
 * Returns entries with rank field attached.
 */
export function rankEntries<T extends RankedEntry>(
  entries: T[],
): Array<T & { rank: number }> {
  const sorted = [...entries].sort((a, b) => {
    if (b.overallScore !== a.overallScore) return b.overallScore - a.overallScore
    return b.salesScore - a.salesScore
  })
  return sorted.map((e, i) => ({ ...e, rank: i + 1 }))
}

/**
 * Compute sales score from actual vs target sales.
 * Exceeding target is capped at 100.
 */
export function calcSalesScore(actualSales: number, targetSales: number): number {
  if (targetSales <= 0) return 0
  return normalizeScore(Math.round((actualSales / targetSales) * 100))
}

/**
 * Compute attendance score from present days vs working days.
 * Full attendance = 100, proportional below.
 */
export function calcAttendanceScore(presentDays: number, workingDays: number): number {
  if (workingDays <= 0) return 0
  return normalizeScore(Math.round((presentDays / workingDays) * 100))
}

/**
 * Normalize a 1–5 customer rating to 0–100.
 */
export function calcCustomerScore(avgRating: number): number {
  // 1 → 0, 3 → 50, 5 → 100
  return normalizeScore(Math.round(((avgRating - 1) / 4) * 100))
}

export interface PeriodEntry {
  period: string   // YYYY-MM
  overallScore: number
}

/**
 * Aggregate multiple period scores for an employee (average).
 * Returns 0 for empty array.
 */
export function aggregatePeriodScores(entries: PeriodEntry[]): number {
  if (entries.length === 0) return 0
  const sum = entries.reduce((acc, e) => acc + e.overallScore, 0)
  return Math.round(sum / entries.length)
}

/**
 * Get the badge display config for UI rendering.
 */
export function getBadgeConfig(badge: BadgeTier): {
  label: string
  color: string
  bg: string
  emoji: string
} {
  switch (badge) {
    case 'PLATINUM':
      return { label: 'Platinum', color: 'text-cyan-400', bg: 'bg-cyan-400/10', emoji: '💎' }
    case 'GOLD':
      return { label: 'Gold', color: 'text-yellow-400', bg: 'bg-yellow-400/10', emoji: '🥇' }
    case 'SILVER':
      return { label: 'Silver', color: 'text-slate-300', bg: 'bg-slate-300/10', emoji: '🥈' }
    case 'BRONZE':
      return { label: 'Bronze', color: 'text-orange-400', bg: 'bg-orange-400/10', emoji: '🥉' }
  }
}
