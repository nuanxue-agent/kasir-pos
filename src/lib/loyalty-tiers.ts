// ─── Loyalty Tier Engine — pure functions (testable) ──────────────────────────

export type TierName = 'Bronze' | 'Silver' | 'Gold' | 'Platinum'
export type TargetType = 'PURCHASE_COUNT' | 'SPEND_AMOUNT' | 'VISIT_STREAK'

export interface TierConfig {
  name: TierName
  minPoints: number
  maxPoints: number | null
  discountPct: number
  bonusMultiplier: number
  badgeColor: string
  badgeIcon: string
  benefits: string[]
}

export interface LoyaltyTier {
  id: string
  storeId: string
  name: string
  minPoints: number
  maxPoints: number | null
  discountPct: number
  bonusMultiplier: number
  badgeColor: string
  active: boolean
}

export interface CustomerBadge {
  id: string
  customerId: string
  storeId: string
  badge: string
  earnedAt: string
}

export interface LoyaltyChallenge {
  id: string
  storeId: string
  name: string
  description: string
  targetType: TargetType
  targetValue: number
  rewardPoints: number
  startAt: string
  endAt: string
  active: boolean
}

export interface CustomerChallenge {
  id: string
  challengeId: string
  customerId: string
  progress: number
  completed: boolean
  completedAt: string | null
}

// ─── Default tier definitions ─────────────────────────────────────────────────

export const DEFAULT_TIERS: TierConfig[] = [
  {
    name: 'Bronze',
    minPoints: 0,
    maxPoints: 999,
    discountPct: 0,
    bonusMultiplier: 1.0,
    badgeColor: '#CD7F32',
    badgeIcon: '🥉',
    benefits: ['Akses program loyalitas', 'Poin per pembelian'],
  },
  {
    name: 'Silver',
    minPoints: 1000,
    maxPoints: 4999,
    discountPct: 3,
    bonusMultiplier: 1.25,
    badgeColor: '#C0C0C0',
    badgeIcon: '🥈',
    benefits: ['Diskon 3%', 'Poin x1.25', 'Prioritas antrian'],
  },
  {
    name: 'Gold',
    minPoints: 5000,
    maxPoints: 14999,
    discountPct: 7,
    bonusMultiplier: 1.5,
    badgeColor: '#FFD700',
    badgeIcon: '🥇',
    benefits: ['Diskon 7%', 'Poin x1.5', 'Hadiah ulang tahun', 'Early access promo'],
  },
  {
    name: 'Platinum',
    minPoints: 15000,
    maxPoints: null,
    discountPct: 12,
    bonusMultiplier: 2.0,
    badgeColor: '#E5E4E2',
    badgeIcon: '💎',
    benefits: ['Diskon 12%', 'Poin x2', 'Layanan eksklusif', 'Undangan event VIP', 'Free delivery'],
  },
]

// ─── Tier assignment ──────────────────────────────────────────────────────────

/** Return the tier config matching the given point total, using DEFAULT_TIERS. */
export function assignTier(points: number, tiers: TierConfig[] = DEFAULT_TIERS): TierConfig {
  // Sort descending by minPoints so first match wins
  const sorted = [...tiers].sort((a, b) => b.minPoints - a.minPoints)
  const match = sorted.find((t) => points >= t.minPoints)
  return match ?? tiers[0]
}

/** Return the tier config matching using a generic LoyaltyTier[] (from DB). */
export function assignTierFromDB(
  points: number,
  tiers: Pick<LoyaltyTier, 'name' | 'minPoints' | 'maxPoints' | 'bonusMultiplier' | 'discountPct'>[],
): (typeof tiers)[number] | null {
  if (tiers.length === 0) return null
  const sorted = [...tiers].sort((a, b) => b.minPoints - a.minPoints)
  return sorted.find((t) => points >= t.minPoints) ?? null
}

// ─── Tier upgrade detection ───────────────────────────────────────────────────

export interface TierUpgradeResult {
  upgraded: boolean
  previous: TierConfig
  current: TierConfig
}

/**
 * Compare old and new point totals and detect whether the customer
 * crossed into a higher tier.
 */
export function detectTierUpgrade(
  oldPoints: number,
  newPoints: number,
  tiers: TierConfig[] = DEFAULT_TIERS,
): TierUpgradeResult {
  const previous = assignTier(oldPoints, tiers)
  const current = assignTier(newPoints, tiers)
  return {
    upgraded: current.minPoints > previous.minPoints,
    previous,
    current,
  }
}

// ─── Bonus multiplier ─────────────────────────────────────────────────────────

/**
 * Apply the tier's bonusMultiplier to a base point earn.
 * Result is always a non-negative integer.
 */
export function applyBonusMultiplier(basePoints: number, multiplier: number): number {
  if (basePoints < 0) return 0
  return Math.round(basePoints * multiplier)
}

// ─── Challenge progress ───────────────────────────────────────────────────────

export interface ChallengeProgressResult {
  progress: number
  completed: boolean
  pctComplete: number
}

/**
 * Calculate new progress after applying an increment.
 * Returns whether the challenge is now complete.
 */
export function calcChallengeProgress(
  current: number,
  increment: number,
  targetValue: number,
): ChallengeProgressResult {
  const progress = Math.max(0, current + increment)
  const completed = progress >= targetValue
  const pctComplete = targetValue > 0 ? Math.min(100, Math.round((progress / targetValue) * 100)) : 0
  return { progress, completed, pctComplete }
}

// ─── Streak detection ─────────────────────────────────────────────────────────

/**
 * Given a sorted array of ISO date strings (ascending), compute the current
 * consecutive-day streak as of `asOf` (defaults to today).
 *
 * A streak counts consecutive calendar days with at least one visit.
 */
export function calcVisitStreak(visitDates: string[], asOf?: string): number {
  if (visitDates.length === 0) return 0

  // Deduplicate to one visit per calendar day
  const days = Array.from(new Set(visitDates.map((d) => d.slice(0, 10)))).sort()
  const refDate = (asOf ?? new Date().toISOString()).slice(0, 10)

  // Walk backwards from refDate
  let streak = 0
  let current = refDate

  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i] === current) {
      streak++
      // move current back one day
      const d = new Date(current)
      d.setUTCDate(d.getUTCDate() - 1)
      current = d.toISOString().slice(0, 10)
    } else if (days[i] < current) {
      // Gap — streak broken
      break
    }
  }

  return streak
}

/**
 * Check whether a VISIT_STREAK challenge is met given visit dates.
 */
export function isChallengeStreakMet(visitDates: string[], targetStreak: number, asOf?: string): boolean {
  return calcVisitStreak(visitDates, asOf) >= targetStreak
}

// ─── Points to next tier ──────────────────────────────────────────────────────

export interface NextTierInfo {
  nextTier: TierConfig | null
  pointsNeeded: number
  pctProgress: number
}

export function calcNextTierProgress(
  points: number,
  tiers: TierConfig[] = DEFAULT_TIERS,
): NextTierInfo {
  const current = assignTier(points, tiers)
  const sorted = [...tiers].sort((a, b) => a.minPoints - b.minPoints)
  const nextTier = sorted.find((t) => t.minPoints > current.minPoints) ?? null

  if (!nextTier) {
    return { nextTier: null, pointsNeeded: 0, pctProgress: 100 }
  }

  const range = nextTier.minPoints - current.minPoints
  const earned = points - current.minPoints
  const pctProgress = range > 0 ? Math.min(100, Math.round((earned / range) * 100)) : 100

  return { nextTier, pointsNeeded: Math.max(0, nextTier.minPoints - points), pctProgress }
}
