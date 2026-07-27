/**
 * Loyalty program utility functions — pure, no side effects.
 */

export interface LoyaltyTierDef {
  name: string
  minPoints: number
  discount: number
  color: string
  icon: string
}

/**
 * Calculate how many points a customer earns for an order.
 * @param orderTotal  - total order amount in smallest currency unit (e.g. IDR)
 * @param ratePerUnit - how many currency units equal 1 point (e.g. 1000 means 1 pt per Rp1.000)
 * @returns integer points earned (floors the result)
 */
export function calculatePointsEarned(orderTotal: number, ratePerUnit: number): number {
  if (ratePerUnit <= 0) return 0
  if (orderTotal <= 0) return 0
  return Math.floor(orderTotal / ratePerUnit)
}

/**
 * Convert a points balance to a monetary discount value.
 * @param points        - number of points to redeem
 * @param valuePerPoint - monetary value of each point (e.g. 100 means 1 pt = Rp100)
 * @returns total monetary value of the points
 */
export function calculatePointsValue(points: number, valuePerPoint: number): number {
  if (points <= 0) return 0
  if (valuePerPoint <= 0) return 0
  return points * valuePerPoint
}

/**
 * Return the highest tier a customer qualifies for based on their points balance.
 * Tiers should be sorted ascending by minPoints — the last qualifying tier wins.
 * @param points - current customer points balance
 * @param tiers  - array of tier definitions
 * @returns the matching tier object, or null if no tier is reached
 */
export function getTier(points: number, tiers: LoyaltyTierDef[]): LoyaltyTierDef | null {
  if (!tiers || tiers.length === 0) return null
  const sorted = [...tiers].sort((a, b) => a.minPoints - b.minPoints)
  let matched: LoyaltyTierDef | null = null
  for (const tier of sorted) {
    if (points >= tier.minPoints) {
      matched = tier
    }
  }
  return matched
}

/**
 * Check whether a customer has enough points to perform a redemption.
 * @param points         - current customer points balance
 * @param minRedeemable  - minimum points required to redeem
 * @returns true if eligible
 */
export function isEligibleForRedemption(points: number, minRedeemable: number): boolean {
  if (minRedeemable <= 0) return points > 0
  return points >= minRedeemable
}
