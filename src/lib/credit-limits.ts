// Pure business logic for credit limit management — imported by tests and API routes

export type CreditStatus = 'GOOD' | 'WARNING' | 'FROZEN'

export interface CustomerCreditRow {
  id: string
  storeId: string
  customerId: string
  creditLimit: number
  usedCredit: number
  availableCredit: number
  paymentTermsDays: number
  status: CreditStatus
  lastReviewedAt: string | null
}

export interface CreditTransactionRow {
  id: string
  customerId: string
  storeId: string
  type: 'CHARGE' | 'PAYMENT' | 'ADJUSTMENT'
  amount: number
  balance: number
  reference: string | null
  createdAt: string
}

// ── Core calculations ────────────────────────────────────────────────────────

/** Returns the available credit: limit minus used, floored at 0 */
export function calcAvailableCredit(creditLimit: number, usedCredit: number): number {
  return Math.max(0, creditLimit - usedCredit)
}

/** Returns utilization as a percentage (0–100+) */
export function calcUtilizationPct(creditLimit: number, usedCredit: number): number {
  if (creditLimit <= 0) return 0
  return (usedCredit / creditLimit) * 100
}

/**
 * Determines credit status from utilization:
 *  < 80%  → GOOD
 *  80–99% → WARNING
 * 100%+   → FROZEN
 */
export function determineCreditStatus(creditLimit: number, usedCredit: number): CreditStatus {
  const pct = calcUtilizationPct(creditLimit, usedCredit)
  if (pct >= 100) return 'FROZEN'
  if (pct >= 80) return 'WARNING'
  return 'GOOD'
}

/** Returns whether a new charge would be allowed (not frozen and enough room) */
export function canCharge(creditLimit: number, usedCredit: number, chargeAmount: number): boolean {
  const status = determineCreditStatus(creditLimit, usedCredit)
  if (status === 'FROZEN') return false
  return usedCredit + chargeAmount <= creditLimit
}

/**
 * Calculates the due date ISO string given a start date and payment terms in days.
 * startDate should be an ISO date string (YYYY-MM-DD or full ISO).
 */
export function calcDueDate(startDate: string, paymentTermsDays: number): string {
  const d = new Date(startDate)
  d.setDate(d.getDate() + paymentTermsDays)
  return d.toISOString().slice(0, 10)
}

/** Returns days overdue (negative means not yet due) given today ISO string */
export function calcDaysOverdue(dueDate: string, todayISO: string): number {
  const due = new Date(dueDate).getTime()
  const today = new Date(todayISO).getTime()
  const diffMs = today - due
  return Math.floor(diffMs / (1000 * 60 * 60 * 24))
}

/** Applies a credit transaction and returns new usedCredit balance */
export function applyTransaction(
  currentUsed: number,
  type: 'CHARGE' | 'PAYMENT' | 'ADJUSTMENT',
  amount: number,
): number {
  switch (type) {
    case 'CHARGE':
      return currentUsed + amount
    case 'PAYMENT':
      return Math.max(0, currentUsed - amount)
    case 'ADJUSTMENT':
      // amount can be positive (increase used) or negative (decrease used)
      return Math.max(0, currentUsed + amount)
  }
}
