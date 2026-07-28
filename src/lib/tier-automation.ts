// Pure business logic for loyalty tier automation — no DB deps, fully testable

export interface TierRule {
  id: string
  storeId: string
  tierName: string
  minSpend: number
  minPoints: number
  minVisits: number
  periodDays: number
  benefits: Record<string, any>
  color: string
  icon: string
  active?: boolean
}

export interface CustomerActivity {
  customerId: string
  storeId: string
  totalSpend: number
  totalPoints: number
  totalVisits: number
  currentTier: string | null
}

export interface TierEvaluationResult {
  customerId: string
  currentTier: string | null
  qualifiedTier: string | null
  changed: boolean
  reason: string
}

/**
 * Check if a customer's activity qualifies for a given tier rule.
 * All criteria use AND logic — customer must meet ALL non-zero thresholds.
 */
export function qualifiesForTier(activity: CustomerActivity, rule: TierRule): boolean {
  const spendOk = rule.minSpend <= 0 || activity.totalSpend >= rule.minSpend
  const pointsOk = rule.minPoints <= 0 || activity.totalPoints >= rule.minPoints
  const visitsOk = rule.minVisits <= 0 || activity.totalVisits >= rule.minVisits
  return spendOk && pointsOk && visitsOk
}

/**
 * Find the best qualifying tier for a customer from a list of rules.
 * Returns the tier with the highest minSpend threshold (i.e. highest tier earned).
 * Returns null if no rule is satisfied.
 */
export function findBestTier(activity: CustomerActivity, rules: TierRule[]): TierRule | null {
  const qualifying = rules.filter(r => qualifiesForTier(activity, r))
  if (qualifying.length === 0) return null
  // Pick the "highest" tier by minSpend (or minPoints as tiebreaker)
  return qualifying.reduce((best, r) => {
    if (r.minSpend > best.minSpend) return r
    if (r.minSpend === best.minSpend && r.minPoints > best.minPoints) return r
    return best
  })
}

/**
 * Evaluate a single customer against tier rules.
 * Returns upgrade/downgrade/no-change result with a human-readable reason.
 */
export function evaluateCustomerTier(
  activity: CustomerActivity,
  rules: TierRule[],
): TierEvaluationResult {
  const bestRule = findBestTier(activity, rules)
  const qualifiedTier = bestRule?.tierName ?? null
  const changed = qualifiedTier !== activity.currentTier

  let reason = 'No change'
  if (changed) {
    if (qualifiedTier === null) {
      reason = `Removed from tier (did not meet any threshold)`
    } else if (activity.currentTier === null) {
      reason = `Assigned to ${qualifiedTier} tier`
    } else {
      // Determine if upgrade or downgrade by comparing rule minSpend
      const currentRule = rules.find(r => r.tierName === activity.currentTier)
      const newRule = bestRule!
      if (newRule.minSpend > (currentRule?.minSpend ?? 0)) {
        reason = `Upgraded from ${activity.currentTier} to ${qualifiedTier}`
      } else {
        reason = `Downgraded from ${activity.currentTier} to ${qualifiedTier}`
      }
    }
  }

  return {
    customerId: activity.customerId,
    currentTier: activity.currentTier,
    qualifiedTier,
    changed,
    reason,
  }
}

/**
 * Batch-evaluate all customers against tier rules.
 * Returns only changed evaluations.
 */
export function batchEvaluateTiers(
  activities: CustomerActivity[],
  rules: TierRule[],
): TierEvaluationResult[] {
  return activities
    .map(a => evaluateCustomerTier(a, rules))
    .filter(r => r.changed)
}

/**
 * Calculate total spend for a customer within a rolling period.
 * Filters transactions to those within periodDays from now.
 */
export function calcPeriodSpend(
  transactions: Array<{ amount: number; date: string }>,
  periodDays: number,
  now = new Date(),
): number {
  if (periodDays <= 0) {
    // 0 = all-time, no period restriction
    return transactions.reduce((sum, t) => sum + t.amount, 0)
  }
  const cutoff = new Date(now)
  cutoff.setDate(cutoff.getDate() - periodDays)
  return transactions
    .filter(t => new Date(t.date) >= cutoff)
    .reduce((sum, t) => sum + t.amount, 0)
}

/**
 * Calculate total visits for a customer within a rolling period.
 */
export function calcPeriodVisits(
  visits: Array<{ date: string }>,
  periodDays: number,
  now = new Date(),
): number {
  if (periodDays <= 0) return visits.length
  const cutoff = new Date(now)
  cutoff.setDate(cutoff.getDate() - periodDays)
  return visits.filter(v => new Date(v.date) >= cutoff).length
}

/**
 * Determine change direction: 'upgrade', 'downgrade', 'new', 'removed', or 'none'.
 */
export function getTierChangeDirection(
  fromTier: string | null,
  toTier: string | null,
  rules: TierRule[],
): 'upgrade' | 'downgrade' | 'new' | 'removed' | 'none' {
  if (fromTier === toTier) return 'none'
  if (fromTier === null) return 'new'
  if (toTier === null) return 'removed'
  const fromRule = rules.find(r => r.tierName === fromTier)
  const toRule = rules.find(r => r.tierName === toTier)
  const fromSpend = fromRule?.minSpend ?? 0
  const toSpend = toRule?.minSpend ?? 0
  return toSpend > fromSpend ? 'upgrade' : 'downgrade'
}
