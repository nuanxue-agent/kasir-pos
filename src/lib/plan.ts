// Plan/subscription feature gating helpers

export type Plan = 'FREE' | 'PRO' | 'ENTERPRISE'

export type Feature =
  | 'MULTI_STORE'
  | 'ADVANCED_REPORTS'
  | 'API_ACCESS'
  | 'WHITE_LABEL'
  | 'GIFT_CARDS'
  | 'MANUFACTURING'

export interface PlanLimits {
  maxStores: number       // -1 = unlimited
  maxProducts: number     // -1 = unlimited
  maxCashiers: number     // -1 = unlimited
  features: Feature[]
}

const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  FREE: {
    maxStores: 1,
    maxProducts: 100,
    maxCashiers: 1,
    features: [],
  },
  PRO: {
    maxStores: 3,
    maxProducts: -1,
    maxCashiers: 5,
    features: ['MULTI_STORE', 'ADVANCED_REPORTS', 'API_ACCESS', 'GIFT_CARDS'],
  },
  ENTERPRISE: {
    maxStores: -1,
    maxProducts: -1,
    maxCashiers: -1,
    features: [
      'MULTI_STORE',
      'ADVANCED_REPORTS',
      'API_ACCESS',
      'WHITE_LABEL',
      'GIFT_CARDS',
      'MANUFACTURING',
    ],
  },
}

/** Return the limits object for a given plan. */
export function getPlanLimits(plan: Plan): PlanLimits {
  return PLAN_LIMITS[plan]
}

/** Check whether a specific feature is available on the given plan. */
export function isFeatureAllowed(plan: Plan, feature: Feature): boolean {
  return PLAN_LIMITS[plan].features.includes(feature)
}

/**
 * Return true if the plan allows adding one more product given the
 * current count.  -1 means unlimited so it always passes.
 */
export function checkProductLimit(plan: Plan, currentCount: number): boolean {
  const { maxProducts } = PLAN_LIMITS[plan]
  if (maxProducts === -1) return true
  return currentCount < maxProducts
}

/**
 * Return true if the plan allows adding one more store given the
 * current store count.
 */
export function checkStoreLimit(plan: Plan, currentCount: number): boolean {
  const { maxStores } = PLAN_LIMITS[plan]
  if (maxStores === -1) return true
  return currentCount < maxStores
}

/**
 * Usage as a percentage (0-100).  Returns 100 when the limit is reached or
 * exceeded; returns 0 when the limit is unlimited (-1).
 */
export function usagePercent(limit: number, current: number): number {
  if (limit === -1) return 0
  if (limit === 0) return 100
  return Math.min(100, Math.round((current / limit) * 100))
}

/** Human-readable label for a plan. */
export function planLabel(plan: Plan): string {
  return { FREE: 'Gratis', PRO: 'Pro', ENTERPRISE: 'Enterprise' }[plan]
}
