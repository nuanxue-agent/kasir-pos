/**
 * @module commissions
 * Pure helper functions for commission calculation and validation.
 * Used by API routes and unit tests.
 */

export type CommissionType = 'FIXED' | 'PERCENTAGE' | 'TIERED'
export type CommissionStatus = 'PENDING' | 'APPROVED' | 'PAID'

export interface TierBand {
  minSales: number
  maxSales: number | null // null = unlimited
  rate: number // percentage (e.g. 3 = 3%)
}

export interface CommissionRule {
  id: string
  storeId: string
  employeeId: string | null
  type: CommissionType
  value: number // percentage for PERCENTAGE, flat amount for FIXED, ignored for TIERED
  minSales: number
  maxSales: number | null
  productCategory: string | null
  active: boolean
  tiers?: TierBand[] | null // for TIERED type
}

export interface CommissionEntry {
  id: string
  ruleId: string
  storeId: string
  employeeId: string
  orderId: string
  saleAmount: number
  commissionAmount: number
  period: string // YYYY-MM
  status: CommissionStatus
  paidAt: string | null
}

export interface MonthlySummary {
  employeeId: string
  employeeName?: string
  period: string
  totalSales: number
  totalCommission: number
  pendingCount: number
  approvedCount: number
  paidCount: number
}

// ── Calculation helpers ───────────────────────────────────────────────────────

/**
 * Calculate a FIXED commission (flat amount per sale, regardless of sale amount).
 */
export function calcFixedCommission(rule: Pick<CommissionRule, 'value'>): number {
  return Math.max(0, rule.value)
}

/**
 * Calculate a PERCENTAGE commission (saleAmount × rate / 100).
 */
export function calcPercentageCommission(
  saleAmount: number,
  rule: Pick<CommissionRule, 'value'>,
): number {
  if (saleAmount <= 0 || rule.value <= 0) return 0
  return Math.round((saleAmount * rule.value) / 100)
}

/**
 * Calculate a TIERED commission.
 * Tiers are applied to the cumulative monthly sales amount that falls within
 * each band. Each band has a minSales, maxSales (null = unlimited), and rate (%).
 *
 * Example: bands [{0, 10M, 2%}, {10M, null, 3%}]
 * For saleAmount 15M:
 *   10M × 2% = 200k
 *   5M × 3%  = 150k
 *   Total    = 350k
 */
export function calcTieredCommission(saleAmount: number, tiers: TierBand[]): number {
  if (saleAmount <= 0 || tiers.length === 0) return 0

  // Sort tiers by minSales ascending
  const sorted = [...tiers].sort((a, b) => a.minSales - b.minSales)
  let commission = 0
  let remaining = saleAmount

  for (const tier of sorted) {
    if (remaining <= 0) break
    const bandStart = tier.minSales
    const bandEnd = tier.maxSales ?? Infinity
    const bandSize = bandEnd - bandStart

    // How much of the sale falls inside this band
    const applicable = Math.min(remaining, bandSize)
    if (applicable <= 0) continue

    commission += Math.round((applicable * tier.rate) / 100)
    remaining -= applicable
  }

  return commission
}

/**
 * Apply a commission rule to a sale amount. Returns the commission amount.
 * Returns 0 if the sale doesn't meet minSales threshold or the rule is inactive.
 */
export function applyRule(
  saleAmount: number,
  rule: CommissionRule & { tiers?: TierBand[] | null },
): number {
  if (!rule.active) return 0
  if (saleAmount < rule.minSales) return 0
  if (rule.maxSales !== null && saleAmount > rule.maxSales) return 0

  switch (rule.type) {
    case 'FIXED':
      return calcFixedCommission(rule)
    case 'PERCENTAGE':
      return calcPercentageCommission(saleAmount, rule)
    case 'TIERED':
      return calcTieredCommission(saleAmount, rule.tiers ?? [])
    default:
      return 0
  }
}

// ── Summary aggregation ───────────────────────────────────────────────────────

/**
 * Aggregate commission entries into monthly summaries per employee.
 */
export function aggregateMonthlySummary(
  entries: CommissionEntry[],
  period: string,
): MonthlySummary[] {
  const map = new Map<string, MonthlySummary>()

  for (const entry of entries) {
    if (entry.period !== period) continue

    if (!map.has(entry.employeeId)) {
      map.set(entry.employeeId, {
        employeeId: entry.employeeId,
        period,
        totalSales: 0,
        totalCommission: 0,
        pendingCount: 0,
        approvedCount: 0,
        paidCount: 0,
      })
    }

    const summary = map.get(entry.employeeId)!
    summary.totalSales += entry.saleAmount
    summary.totalCommission += entry.commissionAmount

    if (entry.status === 'PENDING') summary.pendingCount++
    else if (entry.status === 'APPROVED') summary.approvedCount++
    else if (entry.status === 'PAID') summary.paidCount++
  }

  return Array.from(map.values())
}

// ── Status transition validation ─────────────────────────────────────────────

const VALID_TRANSITIONS: Record<CommissionStatus, CommissionStatus[]> = {
  PENDING: ['APPROVED'],
  APPROVED: ['PAID'],
  PAID: [],
}

/**
 * Returns true if the status transition from `from` → `to` is allowed.
 */
export function isValidStatusTransition(from: CommissionStatus, to: CommissionStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}

/**
 * Returns all valid next statuses from a given status.
 */
export function nextStatuses(from: CommissionStatus): CommissionStatus[] {
  return VALID_TRANSITIONS[from] ?? []
}

// ── Period helpers ────────────────────────────────────────────────────────────

/** Return current period as YYYY-MM */
export function currentPeriod(): string {
  return new Date().toISOString().slice(0, 7)
}

/** Return period string for a given date */
export function dateToPeriod(date: Date | string): string {
  return new Date(date).toISOString().slice(0, 7)
}
