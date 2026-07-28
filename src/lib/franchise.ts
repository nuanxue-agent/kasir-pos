// Pure franchise business logic — no DB deps, no Next.js deps

export type RoyaltyType = 'PERCENTAGE' | 'FIXED'
export type BillingCycle = 'WEEKLY' | 'MONTHLY'
export type FranchiseStatus = 'ACTIVE' | 'SUSPENDED' | 'TERMINATED'
export type RoyaltyStatus = 'PENDING' | 'PAID' | 'OVERDUE'

export interface Franchise {
  id: string
  franchiseeStoreId: string
  franchisorStoreId: string
  royaltyRate: number
  royaltyType: RoyaltyType
  billingCycle: BillingCycle
  status: FranchiseStatus
  startDate: string
  createdAt: string
  updatedAt: string
}

export interface FranchiseRoyalty {
  id: string
  franchiseId: string
  storeId: string
  period: string
  amount: number
  status: RoyaltyStatus
  dueDate: string
  paidAt: string | null
  createdAt: string
  updatedAt: string
}

// ── Royalty calculation ───────────────────────────────────────────────────────

export function calcRoyaltyAmount(
  totalSales: number,
  royaltyType: RoyaltyType,
  royaltyRate: number,
): number {
  if (royaltyType === 'PERCENTAGE') {
    return Math.round(totalSales * (royaltyRate / 100) * 100) / 100
  }
  // FIXED
  return royaltyRate
}

// ── Overdue detection ─────────────────────────────────────────────────────────

export function isOverdue(royalty: Pick<FranchiseRoyalty, 'status' | 'dueDate'>, now = new Date()): boolean {
  if (royalty.status === 'PAID') return false
  return now > new Date(royalty.dueDate)
}

export function applyOverdueStatuses(
  royalties: FranchiseRoyalty[],
  now = new Date(),
): FranchiseRoyalty[] {
  return royalties.map(r => ({
    ...r,
    status: r.status === 'PAID' ? 'PAID' : isOverdue(r, now) ? 'OVERDUE' : r.status,
  }))
}

// ── Billing cycle period generation ──────────────────────────────────────────

export function getBillingPeriod(date: Date, cycle: BillingCycle): { period: string; dueDate: string } {
  const y = date.getUTCFullYear()
  const m = date.getUTCMonth()
  const d = date.getUTCDate()

  if (cycle === 'MONTHLY') {
    // Period = YYYY-MM, due on 5th of following month
    const periodStr = `${y}-${String(m + 1).padStart(2, '0')}`
    const dueY = m === 11 ? y + 1 : y
    const dueM = m === 11 ? 0 : m + 1
    const dueDate = new Date(Date.UTC(dueY, dueM, 5)).toISOString().split('T')[0]
    return { period: periodStr, dueDate }
  }

  // WEEKLY — ISO week: period = YYYY-WNN, due 3 days after Sunday
  const dow = date.getUTCDay() // 0=Sun
  const weekStart = new Date(Date.UTC(y, m, d - dow))
  const weekEnd = new Date(Date.UTC(y, m, d - dow + 6))
  const wY = weekStart.getUTCFullYear()
  // ISO week number
  const jan1 = new Date(Date.UTC(wY, 0, 1))
  const weekNum = Math.ceil(((weekStart.getTime() - jan1.getTime()) / 86400000 + jan1.getUTCDay() + 1) / 7)
  const period = `${wY}-W${String(weekNum).padStart(2, '0')}`
  const dueDate = new Date(weekEnd.getTime() + 3 * 86400000).toISOString().split('T')[0]
  return { period, dueDate }
}

export function generateBillingPeriods(
  startDate: string,
  endDate: string,
  cycle: BillingCycle,
): Array<{ period: string; dueDate: string }> {
  const results: Array<{ period: string; dueDate: string }> = []
  const end = new Date(endDate)
  let cursor = new Date(startDate)

  const seen = new Set<string>()
  while (cursor <= end) {
    const entry = getBillingPeriod(cursor, cycle)
    if (!seen.has(entry.period)) {
      seen.add(entry.period)
      results.push(entry)
    }
    // Advance
    if (cycle === 'MONTHLY') {
      const nextM = cursor.getUTCMonth() + 1
      cursor = new Date(Date.UTC(
        nextM === 12 ? cursor.getUTCFullYear() + 1 : cursor.getUTCFullYear(),
        nextM === 12 ? 0 : nextM,
        1,
      ))
    } else {
      cursor = new Date(cursor.getTime() + 7 * 86400000)
    }
  }
  return results
}

// ── Status transitions ────────────────────────────────────────────────────────

const ROYALTY_TRANSITIONS: Record<RoyaltyStatus, RoyaltyStatus[]> = {
  PENDING: ['PAID', 'OVERDUE'],
  OVERDUE: ['PAID'],
  PAID: [],
}

export function isValidRoyaltyTransition(from: RoyaltyStatus, to: RoyaltyStatus): boolean {
  return ROYALTY_TRANSITIONS[from]?.includes(to) ?? false
}

const FRANCHISE_TRANSITIONS: Record<FranchiseStatus, FranchiseStatus[]> = {
  ACTIVE: ['SUSPENDED', 'TERMINATED'],
  SUSPENDED: ['ACTIVE', 'TERMINATED'],
  TERMINATED: [],
}

export function isValidFranchiseTransition(from: FranchiseStatus, to: FranchiseStatus): boolean {
  return FRANCHISE_TRANSITIONS[from]?.includes(to) ?? false
}
