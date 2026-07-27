/**
 * tier-progress.ts
 * Pure, side-effect-free helpers for loyalty tier progression,
 * milestone detection, and leaderboard ranking.
 * Used by API routes and unit tests alike.
 */

// ─── Tier definitions ─────────────────────────────────────────────────────────

export interface TierDef {
  name: 'Bronze' | 'Silver' | 'Gold' | 'Platinum'
  minPoints: number
  color: string
  icon: string
  benefits: string[]
}

export const DEFAULT_TIERS: TierDef[] = [
  {
    name: 'Bronze',
    minPoints: 0,
    color: '#cd7f32',
    icon: '🥉',
    benefits: ['Earn 1 pt per Rp1.000', 'Birthday bonus 2×'],
  },
  {
    name: 'Silver',
    minPoints: 500,
    color: '#c0c0c0',
    icon: '🥈',
    benefits: ['All Bronze perks', '5% discount on every order', 'Priority support'],
  },
  {
    name: 'Gold',
    minPoints: 1_000,
    color: '#ffd700',
    icon: '🥇',
    benefits: ['All Silver perks', '10% discount', 'Free delivery', 'Exclusive promotions'],
  },
  {
    name: 'Platinum',
    minPoints: 5_000,
    color: '#e5e4e2',
    icon: '💎',
    benefits: [
      'All Gold perks',
      '15% discount',
      'Dedicated account manager',
      'Early access to new products',
      'Annual gift',
    ],
  },
]

// ─── Tier resolution ──────────────────────────────────────────────────────────

/**
 * Return the highest tier a customer qualifies for given their points.
 */
export function getCurrentTier(points: number, tiers: TierDef[] = DEFAULT_TIERS): TierDef {
  const sorted = [...tiers].sort((a, b) => a.minPoints - b.minPoints)
  let matched = sorted[0]
  for (const t of sorted) {
    if (points >= t.minPoints) matched = t
  }
  return matched
}

/**
 * Return the next tier above the customer's current one, or null at Platinum.
 */
export function getNextTier(points: number, tiers: TierDef[] = DEFAULT_TIERS): TierDef | null {
  const sorted = [...tiers].sort((a, b) => a.minPoints - b.minPoints)
  return sorted.find((t) => t.minPoints > points) ?? null
}

/**
 * Calculate progress percentage toward the next tier [0–100].
 * Returns 100 when already at the top tier.
 */
export function getTierProgressPercent(points: number, tiers: TierDef[] = DEFAULT_TIERS): number {
  const current = getCurrentTier(points, tiers)
  const next = getNextTier(points, tiers)
  if (!next) return 100

  const range = next.minPoints - current.minPoints
  if (range <= 0) return 100
  const progress = points - current.minPoints
  return Math.min(100, Math.max(0, Math.floor((progress / range) * 100)))
}

/**
 * How many points does the customer still need to reach the next tier?
 * Returns 0 at the top tier.
 */
export function getPointsToNextTier(points: number, tiers: TierDef[] = DEFAULT_TIERS): number {
  const next = getNextTier(points, tiers)
  if (!next) return 0
  return Math.max(0, next.minPoints - points)
}

/**
 * Determine whether a customer crossed a tier boundary between oldPoints and newPoints.
 * Returns the new TierDef if an upgrade occurred, null otherwise.
 */
export function detectTierUpgrade(
  oldPoints: number,
  newPoints: number,
  tiers: TierDef[] = DEFAULT_TIERS,
): TierDef | null {
  const oldTier = getCurrentTier(oldPoints, tiers)
  const newTier = getCurrentTier(newPoints, tiers)
  if (newTier.name !== oldTier.name && newTier.minPoints > oldTier.minPoints) {
    return newTier
  }
  return null
}

// ─── Milestone definitions ────────────────────────────────────────────────────

export type MilestoneType =
  | 'FIRST_PURCHASE'
  | 'PURCHASE_10'
  | 'PURCHASE_50'
  | 'PURCHASE_100'
  | 'SPEND_100K'
  | 'SPEND_1M'
  | 'SPEND_10M'
  | 'TIER_SILVER'
  | 'TIER_GOLD'
  | 'TIER_PLATINUM'
  | 'POINTS_500'
  | 'POINTS_1000'
  | 'POINTS_5000'

export interface MilestoneDef {
  type: MilestoneType
  label: string
  description: string
  icon: string
}

export const MILESTONE_DEFS: MilestoneDef[] = [
  { type: 'FIRST_PURCHASE', label: 'First Purchase', description: 'Completed first order', icon: '🛒' },
  { type: 'PURCHASE_10', label: '10 Purchases', description: 'Completed 10 orders', icon: '🎯' },
  { type: 'PURCHASE_50', label: '50 Purchases', description: 'Completed 50 orders', icon: '🏅' },
  { type: 'PURCHASE_100', label: '100 Purchases', description: 'Completed 100 orders', icon: '💯' },
  { type: 'SPEND_100K', label: 'Rp100k Spender', description: 'Lifetime spend ≥ Rp100.000', icon: '💸' },
  { type: 'SPEND_1M', label: 'Rp1M Spender', description: 'Lifetime spend ≥ Rp1.000.000', icon: '💰' },
  { type: 'SPEND_10M', label: 'Rp10M Spender', description: 'Lifetime spend ≥ Rp10.000.000', icon: '🤑' },
  { type: 'TIER_SILVER', label: 'Silver Member', description: 'Reached Silver tier', icon: '🥈' },
  { type: 'TIER_GOLD', label: 'Gold Member', description: 'Reached Gold tier', icon: '🥇' },
  { type: 'TIER_PLATINUM', label: 'Platinum Member', description: 'Reached Platinum tier', icon: '💎' },
  { type: 'POINTS_500', label: '500 Points', description: 'Accumulated 500 points', icon: '⭐' },
  { type: 'POINTS_1000', label: '1,000 Points', description: 'Accumulated 1,000 points', icon: '🌟' },
  { type: 'POINTS_5000', label: '5,000 Points', description: 'Accumulated 5,000 points', icon: '✨' },
]

export interface CustomerStats {
  points: number
  totalOrders: number
  totalSpend: number
  currentTierName: string
}

/**
 * Detect which milestones a customer has newly crossed given their current stats
 * and the set of milestones they've already achieved.
 */
export function detectNewMilestones(
  stats: CustomerStats,
  alreadyAchieved: Set<MilestoneType>,
): MilestoneType[] {
  const earned: MilestoneType[] = []

  const checks: Array<{ type: MilestoneType; condition: boolean }> = [
    { type: 'FIRST_PURCHASE', condition: stats.totalOrders >= 1 },
    { type: 'PURCHASE_10', condition: stats.totalOrders >= 10 },
    { type: 'PURCHASE_50', condition: stats.totalOrders >= 50 },
    { type: 'PURCHASE_100', condition: stats.totalOrders >= 100 },
    { type: 'SPEND_100K', condition: stats.totalSpend >= 100_000 },
    { type: 'SPEND_1M', condition: stats.totalSpend >= 1_000_000 },
    { type: 'SPEND_10M', condition: stats.totalSpend >= 10_000_000 },
    { type: 'TIER_SILVER', condition: stats.currentTierName === 'Silver' || stats.currentTierName === 'Gold' || stats.currentTierName === 'Platinum' },
    { type: 'TIER_GOLD', condition: stats.currentTierName === 'Gold' || stats.currentTierName === 'Platinum' },
    { type: 'TIER_PLATINUM', condition: stats.currentTierName === 'Platinum' },
    { type: 'POINTS_500', condition: stats.points >= 500 },
    { type: 'POINTS_1000', condition: stats.points >= 1_000 },
    { type: 'POINTS_5000', condition: stats.points >= 5_000 },
  ]

  for (const { type, condition } of checks) {
    if (condition && !alreadyAchieved.has(type)) {
      earned.push(type)
    }
  }

  return earned
}

// ─── Leaderboard ──────────────────────────────────────────────────────────────

export interface LeaderboardEntry {
  rank: number
  customerId: string
  name: string
  points: number
  tierName: string
  tierIcon: string
}

/**
 * Rank a list of customers by points descending (top N).
 * Ties share the same rank (dense ranking).
 */
export function rankLeaderboard(
  customers: Array<{ customerId: string; name: string; points: number }>,
  tiers: TierDef[] = DEFAULT_TIERS,
  limit = 10,
): LeaderboardEntry[] {
  const sorted = [...customers].sort((a, b) => b.points - a.points).slice(0, limit)
  let rank = 1
  return sorted.map((c, i) => {
    if (i > 0 && c.points < sorted[i - 1].points) rank = i + 1
    const tier = getCurrentTier(c.points, tiers)
    return {
      rank,
      customerId: c.customerId,
      name: c.name,
      points: c.points,
      tierName: tier.name,
      tierIcon: tier.icon,
    }
  })
}
