// Pure business logic for petty cash management — no DB deps, fully testable

export type TransactionType = 'REPLENISHMENT' | 'EXPENSE'

export interface PettyCashFund {
  id: string
  storeId: string
  name: string
  balance: number
  maxBalance: number
  custodian: string
  active: boolean
}

export interface PettyCashTransaction {
  id: string
  fundId: string
  storeId: string
  type: TransactionType
  amount: number
  category: string
  description: string
  receiptNumber: string
  createdBy: string
  createdAt: string
}

export interface CategorySummary {
  category: string
  total: number
  count: number
}

// How much balance remains after an expense
export function calcBalanceAfterExpense(currentBalance: number, expenseAmount: number): number {
  return currentBalance - expenseAmount
}

// How much balance after a replenishment (capped at maxBalance)
export function calcBalanceAfterReplenishment(
  currentBalance: number,
  replenishAmount: number,
  maxBalance: number,
): number {
  return Math.min(currentBalance + replenishAmount, maxBalance)
}

// How much replenishment is needed to reach max
export function calcReplenishmentNeeded(currentBalance: number, maxBalance: number): number {
  return Math.max(0, maxBalance - currentBalance)
}

// Whether an expense would exceed current balance
export function wouldExceedBalance(currentBalance: number, expenseAmount: number): boolean {
  return expenseAmount > currentBalance
}

// Whether balance exceeds maxBalance after replenishment
export function wouldExceedMax(
  currentBalance: number,
  replenishAmount: number,
  maxBalance: number,
): boolean {
  return currentBalance + replenishAmount > maxBalance
}

// Whether fund is below a low-balance threshold (default 20%)
export function isBelowLowBalanceThreshold(
  balance: number,
  maxBalance: number,
  thresholdPct = 0.2,
): boolean {
  if (maxBalance <= 0) return false
  return balance / maxBalance < thresholdPct
}

// Aggregate transactions by category for a given month (EXPENSE only)
export function aggregateByCategory(transactions: PettyCashTransaction[]): CategorySummary[] {
  const map = new Map<string, CategorySummary>()
  for (const tx of transactions) {
    if (tx.type !== 'EXPENSE') continue
    const existing = map.get(tx.category)
    if (existing) {
      existing.total += tx.amount
      existing.count += 1
    } else {
      map.set(tx.category, { category: tx.category, total: tx.amount, count: 1 })
    }
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total)
}

// Filter transactions to a specific month (YYYY-MM)
export function filterByMonth(
  transactions: PettyCashTransaction[],
  yearMonth: string, // 'YYYY-MM'
): PettyCashTransaction[] {
  return transactions.filter(tx => tx.createdAt.startsWith(yearMonth))
}

// Total expenses for a set of transactions
export function totalExpenses(transactions: PettyCashTransaction[]): number {
  return transactions
    .filter(t => t.type === 'EXPENSE')
    .reduce((sum, t) => sum + t.amount, 0)
}

// Total replenishments for a set of transactions
export function totalReplenishments(transactions: PettyCashTransaction[]): number {
  return transactions
    .filter(t => t.type === 'REPLENISHMENT')
    .reduce((sum, t) => sum + t.amount, 0)
}

// ── Cash Advance types & pure functions ───────────────────────────────────────

export type AdvanceTransactionType = 'REPLENISH' | 'EXPENSE' | 'ADVANCE' | 'SETTLEMENT'
export type AdvanceStatus = 'PENDING' | 'APPROVED' | 'SETTLED' | 'REJECTED'

export interface AdvanceTransaction {
  id: string
  fundId: string
  storeId: string
  type: AdvanceTransactionType
  amount: number
  balance: number
  description: string
  category: string
  receiptNo: string
  requestedBy: string
  approvedBy: string
  status: AdvanceStatus
  createdAt: string
}

export interface AdvanceCategorySummary {
  category: string
  total: number
  count: number
}

// Balance after applying a transaction (REPLENISH adds, all others subtract)
export function calcBalanceAfterTx(
  currentBalance: number,
  type: AdvanceTransactionType,
  amount: number,
): number {
  if (type === 'REPLENISH') return currentBalance + amount
  return currentBalance - amount
}

// Valid status transitions for an advance
const VALID_TRANSITIONS: Record<AdvanceStatus, AdvanceStatus[]> = {
  PENDING:  ['APPROVED', 'REJECTED'],
  APPROVED: ['SETTLED', 'REJECTED'],
  SETTLED:  [],
  REJECTED: [],
}

export function isValidAdvanceTransition(from: AdvanceStatus, to: AdvanceStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}

// Calculate how much needs to be replenished to reach a target amount
export function calcReplenishAmount(currentBalance: number, replenishAmount: number): number {
  return Math.max(0, replenishAmount - currentBalance)
}

// Aggregate advance transactions by category (EXPENSE + ADVANCE only)
export function aggregateAdvancesByCategory(
  transactions: AdvanceTransaction[],
): AdvanceCategorySummary[] {
  const map = new Map<string, AdvanceCategorySummary>()
  for (const tx of transactions) {
    if (tx.type !== 'EXPENSE' && tx.type !== 'ADVANCE') continue
    const existing = map.get(tx.category)
    if (existing) {
      existing.total += tx.amount
      existing.count += 1
    } else {
      map.set(tx.category, { category: tx.category, total: tx.amount, count: 1 })
    }
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total)
}

// Find unsettled advances (ADVANCE type with status PENDING or APPROVED)
export function findUnsettledAdvances(transactions: AdvanceTransaction[]): AdvanceTransaction[] {
  return transactions.filter(
    tx => tx.type === 'ADVANCE' && (tx.status === 'PENDING' || tx.status === 'APPROVED'),
  )
}

// Total outstanding advance amount
export function totalUnsettledAmount(transactions: AdvanceTransaction[]): number {
  return findUnsettledAdvances(transactions).reduce((sum, tx) => sum + tx.amount, 0)
}
