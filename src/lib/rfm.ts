/**
 * RFM (Recency, Frequency, Monetary) analysis utilities.
 * Pure functions — no DB or side effects.
 */

export type RFMSegment = 'Champions' | 'Loyal' | 'AtRisk' | 'Lost' | 'New'

export interface RFMScores {
  recencyScore: number   // 1–5 (5 = most recent)
  frequencyScore: number // 1–5 (5 = most frequent)
  monetaryScore: number  // 1–5 (5 = highest spend)
}

export interface RFMCustomer {
  id: string
  name: string
  phone: string | null
  email: string | null
  recency: number   // days since last purchase
  frequency: number // number of orders
  monetary: number  // total spend
  scores: RFMScores
  segment: RFMSegment
}

/**
 * Score a single metric value against a population using percentile quintiles.
 * Returns 1–5 where higher is always "better" for the business.
 * For recency, lower days = better, so we invert.
 */
export function scoreMetric(value: number, allValues: number[], invert = false): number {
  if (allValues.length === 0) return 3
  const sorted = [...allValues].sort((a, b) => a - b)
  const rank = sorted.filter((v) => v <= value).length
  const pct = rank / sorted.length // 0..1
  const score = Math.ceil(pct * 5) as 1 | 2 | 3 | 4 | 5
  const clamped = Math.max(1, Math.min(5, score)) as 1 | 2 | 3 | 4 | 5
  return invert ? (6 - clamped) : clamped
}

/**
 * Assign a segment from R/F/M scores (1–5 each).
 * Thresholds follow the standard RFM segmentation model.
 */
export function assignSegment(r: number, f: number, m: number): RFMSegment {
  const avg = (r + f + m) / 3

  // Champions: high recency, high frequency, high monetary
  if (r >= 4 && f >= 4 && m >= 4) return 'Champions'

  // Loyal: good overall, not necessarily all-5
  if (avg >= 3.5 && f >= 3) return 'Loyal'

  // New: recent buyers, low frequency
  if (r >= 4 && f <= 2) return 'New'

  // At Risk: used to buy well but recency has dropped
  if (r <= 2 && f >= 3) return 'AtRisk'

  // Lost: low recency and low frequency
  if (r <= 2 && f <= 2) return 'Lost'

  // Default to Loyal for mid-range customers
  return avg >= 2.5 ? 'Loyal' : 'AtRisk'
}

export interface RawCustomerStat {
  id: string
  name: string
  phone: string | null
  email: string | null
  recency: number   // days since last purchase (0 = today)
  frequency: number // order count
  monetary: number  // total spend
}

/**
 * Given raw stats for all customers, compute RFM scores and segments.
 */
export function computeRFM(customers: RawCustomerStat[]): RFMCustomer[] {
  if (customers.length === 0) return []

  const recencies  = customers.map((c) => c.recency)
  const frequencies = customers.map((c) => c.frequency)
  const monetaries  = customers.map((c) => c.monetary)

  return customers.map((c) => {
    // recency: lower days = better → invert
    const rScore = scoreMetric(c.recency, recencies, true)
    const fScore = scoreMetric(c.frequency, frequencies, false)
    const mScore = scoreMetric(c.monetary, monetaries, false)
    const segment = assignSegment(rScore, fScore, mScore)

    return {
      ...c,
      scores: { recencyScore: rScore, frequencyScore: fScore, monetaryScore: mScore },
      segment,
    }
  })
}

/**
 * Generate a unique referral code for a customer.
 * Format: first 4 chars of customerId (uppercase) + 6 random alphanumeric chars.
 */
export function generateReferralCode(customerId: string): string {
  const prefix = customerId.replace(/-/g, '').slice(0, 4).toUpperCase()
  const chars  = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // removed ambiguous chars
  let suffix   = ''
  // Use a deterministic seed from the id so the code is stable
  const seed   = customerId
  for (let i = 0; i < 6; i++) {
    const charCode = seed.charCodeAt(i % seed.length)
    suffix += chars[charCode % chars.length]
  }
  return `${prefix}${suffix}`
}

/** Points awarded per successful referral */
export const REFERRAL_REWARD_POINTS = 500

/**
 * Calculate total reward points for N successful referrals.
 */
export function calculateReferralReward(successfulReferrals: number): number {
  if (successfulReferrals <= 0) return 0
  return successfulReferrals * REFERRAL_REWARD_POINTS
}
