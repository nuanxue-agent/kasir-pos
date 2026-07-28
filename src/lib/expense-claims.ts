// ─── Expense Claims — pure business logic (no I/O) ────────────────────────────
// Importable by tests without any DB or Next.js dependencies.

export type ExpenseCategory = 'TRAVEL' | 'MEALS' | 'SUPPLIES' | 'OTHER'
export type ExpenseStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'PAID'
export type UserRole = 'OWNER' | 'MANAGER' | 'CASHIER' | 'STAFF'

export interface ExpenseClaim {
  id: string
  storeId: string
  employeeId: string
  title: string
  amount: number
  category: ExpenseCategory
  receiptUrl?: string | null
  status: ExpenseStatus
  submittedAt?: string | null
  approvedBy?: string | null
  paidAt?: string | null
  notes?: string | null
  createdAt: string
  updatedAt: string
}

// ─── Valid categories ──────────────────────────────────────────────────────────

export const VALID_CATEGORIES: ExpenseCategory[] = ['TRAVEL', 'MEALS', 'SUPPLIES', 'OTHER']

export function isValidCategory(cat: string): cat is ExpenseCategory {
  return VALID_CATEGORIES.includes(cat as ExpenseCategory)
}

// ─── Status machine ────────────────────────────────────────────────────────────

/**
 * Allowed status transitions:
 *   DRAFT      → SUBMITTED  (employee submits)
 *   SUBMITTED  → APPROVED   (manager/owner approves)
 *   SUBMITTED  → REJECTED   (manager/owner rejects)
 *   APPROVED   → PAID       (finance marks paid)
 *   REJECTED   → DRAFT      (employee can resubmit)
 */
const ALLOWED_TRANSITIONS: Record<ExpenseStatus, ExpenseStatus[]> = {
  DRAFT: ['SUBMITTED'],
  SUBMITTED: ['APPROVED', 'REJECTED'],
  APPROVED: ['PAID'],
  REJECTED: ['DRAFT'],
  PAID: [],
}

export function isValidStatusTransition(from: ExpenseStatus, to: ExpenseStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false
}

// ─── Approval permission ───────────────────────────────────────────────────────

/** Only OWNER or MANAGER may approve or reject claims. */
export function canApproveOrReject(role: UserRole): boolean {
  return role === 'OWNER' || role === 'MANAGER'
}

/** Only OWNER or MANAGER (acting as finance) may mark a claim as PAID. */
export function canMarkPaid(role: UserRole): boolean {
  return role === 'OWNER' || role === 'MANAGER'
}

// ─── Monthly summary ───────────────────────────────────────────────────────────

export interface MonthlySummaryRow {
  employeeId: string
  month: string // 'YYYY-MM'
  totalAmount: number
  claimCount: number
  paidAmount: number
}

/**
 * Summarises claims by employee for a given month string ('YYYY-MM').
 * Only SUBMITTED, APPROVED, and PAID claims are counted.
 */
export function calcMonthlySummary(
  claims: ExpenseClaim[],
  month: string,
): MonthlySummaryRow[] {
  const COUNTABLE: ExpenseStatus[] = ['SUBMITTED', 'APPROVED', 'PAID']
  const relevant = claims.filter(
    c => COUNTABLE.includes(c.status) && (c.submittedAt ?? c.createdAt).slice(0, 7) === month,
  )

  const byEmployee: Record<string, MonthlySummaryRow> = {}
  for (const c of relevant) {
    if (!byEmployee[c.employeeId]) {
      byEmployee[c.employeeId] = {
        employeeId: c.employeeId,
        month,
        totalAmount: 0,
        claimCount: 0,
        paidAmount: 0,
      }
    }
    const row = byEmployee[c.employeeId]
    row.totalAmount += c.amount
    row.claimCount += 1
    if (c.status === 'PAID') row.paidAmount += c.amount
  }

  return Object.values(byEmployee)
}

// ─── Bulk approve ──────────────────────────────────────────────────────────────

export interface BulkApproveResult {
  approved: string[]
  skipped: string[]
  totalApprovedAmount: number
}

/**
 * Returns which claims can be approved (status === SUBMITTED) and
 * the total amount of those claims.
 */
export function calcBulkApprove(
  claims: ExpenseClaim[],
  ids: string[],
): BulkApproveResult {
  const idSet = new Set(ids)
  const approved: string[] = []
  const skipped: string[] = []
  let totalApprovedAmount = 0

  for (const c of claims) {
    if (!idSet.has(c.id)) continue
    if (c.status === 'SUBMITTED') {
      approved.push(c.id)
      totalApprovedAmount += c.amount
    } else {
      skipped.push(c.id)
    }
  }

  return { approved, skipped, totalApprovedAmount }
}
