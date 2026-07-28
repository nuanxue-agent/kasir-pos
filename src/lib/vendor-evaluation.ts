// Pure business logic for vendor evaluation — no DB deps, fully testable

export interface VendorEvaluation {
  id: string
  storeId: string
  vendorId: string
  orderId?: string | null
  deliveryScore: number
  qualityScore: number
  priceScore: number
  communicationScore: number
  overallScore: number
  notes?: string | null
  evaluatedAt: string
}

export interface VendorScorecard {
  vendorId: string
  vendorName: string
  avgDelivery: number
  avgQuality: number
  avgPrice: number
  avgCommunication: number
  avgOverall: number
  evaluationCount: number
  trend: 'improving' | 'declining' | 'stable'
  isPreferred: boolean
}

export interface ScoreTrend {
  evaluatedAt: string
  overallScore: number
}

/**
 * Validate a score is in the range 1–5 (integer or float).
 */
export function isValidScore(score: number): boolean {
  return typeof score === 'number' && !isNaN(score) && score >= 1 && score <= 5
}

/**
 * Validate all four dimension scores.
 */
export function validateScores(
  delivery: number,
  quality: number,
  price: number,
  communication: number
): { valid: boolean; error?: string } {
  for (const [label, val] of [
    ['deliveryScore', delivery],
    ['qualityScore', quality],
    ['priceScore', price],
    ['communicationScore', communication],
  ] as [string, number][]) {
    if (!isValidScore(val)) {
      return { valid: false, error: `${label} must be between 1 and 5` }
    }
  }
  return { valid: true }
}

/**
 * Calculate the overall score as the average of the four dimensions.
 * Result is rounded to 2 decimal places.
 */
export function calcOverallScore(
  deliveryScore: number,
  qualityScore: number,
  priceScore: number,
  communicationScore: number
): number {
  const avg = (deliveryScore + qualityScore + priceScore + communicationScore) / 4
  return Math.round(avg * 100) / 100
}

/**
 * Rank vendors by average overall score (descending).
 * Ties broken by evaluationCount descending (more data = more reliable).
 */
export function rankVendorsBySore(scorecards: VendorScorecard[]): VendorScorecard[] {
  return [...scorecards].sort((a, b) => {
    if (b.avgOverall !== a.avgOverall) return b.avgOverall - a.avgOverall
    return b.evaluationCount - a.evaluationCount
  })
}

/**
 * Detect score trend from a chronological series (oldest first).
 * Needs at least 2 data points.
 * - 'improving': last score > first score by > 0.2
 * - 'declining': last score < first score by > 0.2
 * - 'stable': within ±0.2
 */
export function detectScoreTrend(trends: ScoreTrend[]): 'improving' | 'declining' | 'stable' {
  if (trends.length < 2) return 'stable'
  const sorted = [...trends].sort(
    (a, b) => new Date(a.evaluatedAt).getTime() - new Date(b.evaluatedAt).getTime()
  )
  const first = sorted[0].overallScore
  const last = sorted[sorted.length - 1].overallScore
  const delta = last - first
  if (delta > 0.2) return 'improving'
  if (delta < -0.2) return 'declining'
  return 'stable'
}

/**
 * Select preferred vendors: those with avgOverall >= threshold (default 4.0)
 * and at least minEvaluations evaluations.
 */
export function selectPreferredVendors(
  scorecards: VendorScorecard[],
  threshold = 4.0,
  minEvaluations = 2
): VendorScorecard[] {
  return scorecards.filter(
    (s) => s.avgOverall >= threshold && s.evaluationCount >= minEvaluations
  )
}

/**
 * Build a scorecard for a single vendor from their evaluation history.
 */
export function buildVendorScorecard(
  vendorId: string,
  vendorName: string,
  evaluations: VendorEvaluation[],
  preferredThreshold = 4.0,
  minEvaluations = 2
): VendorScorecard {
  const count = evaluations.length
  if (count === 0) {
    return {
      vendorId,
      vendorName,
      avgDelivery: 0,
      avgQuality: 0,
      avgPrice: 0,
      avgCommunication: 0,
      avgOverall: 0,
      evaluationCount: 0,
      trend: 'stable',
      isPreferred: false,
    }
  }

  const sum = evaluations.reduce(
    (acc, e) => ({
      delivery: acc.delivery + e.deliveryScore,
      quality: acc.quality + e.qualityScore,
      price: acc.price + e.priceScore,
      communication: acc.communication + e.communicationScore,
      overall: acc.overall + e.overallScore,
    }),
    { delivery: 0, quality: 0, price: 0, communication: 0, overall: 0 }
  )

  const round2 = (n: number) => Math.round(n * 100) / 100

  const avgOverall = round2(sum.overall / count)
  const trend = detectScoreTrend(
    evaluations.map((e) => ({ evaluatedAt: e.evaluatedAt, overallScore: e.overallScore }))
  )

  return {
    vendorId,
    vendorName,
    avgDelivery: round2(sum.delivery / count),
    avgQuality: round2(sum.quality / count),
    avgPrice: round2(sum.price / count),
    avgCommunication: round2(sum.communication / count),
    avgOverall,
    evaluationCount: count,
    trend,
    isPreferred: avgOverall >= preferredThreshold && count >= minEvaluations,
  }
}
