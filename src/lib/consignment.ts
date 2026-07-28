/**
 * @module consignment
 * Pure business-logic helpers for consignment sales and vendor-managed inventory.
 * No DB calls — importable in both API routes and unit tests.
 */

export type ContractStatus = 'ACTIVE' | 'TERMINATED'
export type SettlementPeriod = 'WEEKLY' | 'MONTHLY'
export type SettlementStatus = 'PENDING' | 'PAID'

export interface ConsignmentContract {
  id: string
  storeId: string
  vendorId: string
  commissionRate: number   // 0–100 (percentage)
  settlementPeriod: SettlementPeriod
  status: ContractStatus
  startDate: string        // ISO date
  createdAt: string
  updatedAt: string
}

export interface ConsignmentItem {
  id: string
  contractId: string
  storeId: string
  productId: string
  qty: number
  costPrice: number
  soldQty: number
  settledQty: number
}

export interface ConsignmentSettlement {
  id: string
  contractId: string
  storeId: string
  period: string           // e.g. "2026-W30" or "2026-07"
  soldQty: number
  totalCost: number
  commissionAmount: number
  status: SettlementStatus
  createdAt: string
  updatedAt: string
}

// ── Commission & settlement maths ─────────────────────────────────────────────

/**
 * Calculate commission amount from cost total and commission rate (0–100).
 * Rounds to 2 decimal places to avoid floating-point drift.
 */
export function calcCommission(totalCost: number, commissionRate: number): number {
  if (commissionRate < 0 || commissionRate > 100) {
    throw new RangeError(`commissionRate must be 0–100, got ${commissionRate}`)
  }
  return Math.round(totalCost * (commissionRate / 100) * 100) / 100
}

/**
 * Amount the store owes the vendor for a settlement:
 *   vendorPayment = totalCost − commissionAmount
 */
export function calcVendorPayment(totalCost: number, commissionRate: number): number {
  const commission = calcCommission(totalCost, commissionRate)
  return Math.round((totalCost - commission) * 100) / 100
}

/**
 * Total revenue of items sold on consignment.
 *   totalCost = soldQty × costPrice
 */
export function calcTotalCost(soldQty: number, costPrice: number): number {
  return Math.round(soldQty * costPrice * 100) / 100
}

/**
 * Units still on hand (not yet sold).
 */
export function calcUnsoldQty(item: Pick<ConsignmentItem, 'qty' | 'soldQty'>): number {
  return Math.max(0, item.qty - item.soldQty)
}

/**
 * Units sold but not yet included in a paid settlement.
 */
export function calcUnsettledQty(item: Pick<ConsignmentItem, 'soldQty' | 'settledQty'>): number {
  return Math.max(0, item.soldQty - item.settledQty)
}

// ── Settlement period helpers ─────────────────────────────────────────────────

/**
 * Return an ISO week label for a given date: "YYYY-Www"
 * Uses ISO 8601 week numbering (Monday = start of week).
 */
export function isoWeekLabel(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = d.getUTCDay() || 7  // Monday=1 … Sunday=7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

/**
 * Return a monthly label for a given date: "YYYY-MM"
 */
export function monthLabel(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

/**
 * Return the period label for a given date and settlement period type.
 */
export function periodLabel(date: Date, periodType: SettlementPeriod): string {
  return periodType === 'WEEKLY' ? isoWeekLabel(date) : monthLabel(date)
}

/**
 * Generate all period labels between startDate and endDate (inclusive).
 * Useful for reporting gaps and building settlement history.
 */
export function generatePeriods(
  startDate: string,
  endDate: string,
  periodType: SettlementPeriod,
): string[] {
  const periods: string[] = []
  const end = new Date(endDate)
  const cursor = new Date(startDate)

  const seen = new Set<string>()
  while (cursor <= end) {
    const label = periodLabel(cursor, periodType)
    if (!seen.has(label)) {
      seen.add(label)
      periods.push(label)
    }
    // Advance: weekly → +7 days, monthly → +1 month
    if (periodType === 'WEEKLY') {
      cursor.setDate(cursor.getDate() + 7)
    } else {
      cursor.setMonth(cursor.getMonth() + 1)
    }
  }
  return periods
}

// ── Contract status transitions ───────────────────────────────────────────────

const ALLOWED_TRANSITIONS: Record<ContractStatus, ContractStatus[]> = {
  ACTIVE:     ['TERMINATED'],
  TERMINATED: [],
}

/**
 * Returns true when transitioning from `from` → `to` is a valid business operation.
 */
export function isValidTransition(from: ContractStatus, to: ContractStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false
}

/**
 * Returns whether a contract is currently active.
 */
export function isContractActive(contract: Pick<ConsignmentContract, 'status'>): boolean {
  return contract.status === 'ACTIVE'
}
