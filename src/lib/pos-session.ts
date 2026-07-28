/**
 * @module pos-session
 * Pure functions for POS terminal session & cash drawer management.
 * No DB deps — safe to import in tests and client code.
 */

export type POSSessionStatus = 'OPEN' | 'CLOSED'
export type POSMovementType = 'FLOAT' | 'SALE' | 'REFUND' | 'PAY_IN' | 'PAY_OUT'

export interface POSSession {
  id: string
  storeId: string
  terminalId: string
  userId: string
  openedAt: string
  closedAt?: string | null
  openingFloat: number
  closingFloat: number
  expectedCash: number
  actualCash: number
  variance: number
  status: POSSessionStatus
}

export interface POSMovement {
  id: string
  sessionId: string
  storeId: string
  type: POSMovementType
  amount: number
  balance: number
  note?: string | null
  createdAt: string
}

export interface PaymentBreakdown {
  cash: number
  card: number
  transfer: number
  other: number
}

export interface ZReport {
  sessionId: string
  terminalId: string
  openedAt: string
  closedAt?: string | null
  status: POSSessionStatus
  openingFloat: number
  totalSales: number
  totalRefunds: number
  totalPayIn: number
  totalPayOut: number
  totalFloat: number
  expectedCash: number
  actualCash: number
  variance: number
  movementCount: number
  paymentBreakdown: PaymentBreakdown
}

/** Signed effect of each movement type on the running cash balance */
export function posMovementEffect(type: POSMovementType): number {
  switch (type) {
    case 'FLOAT':   return 1
    case 'SALE':    return 1
    case 'PAY_IN':  return 1
    case 'REFUND':  return -1
    case 'PAY_OUT': return -1
  }
}

/** Classify a movement as a cash inflow (positive) or outflow (negative) */
export function isInflow(type: POSMovementType): boolean {
  return posMovementEffect(type) > 0
}

/**
 * Calculate expected cash given an opening float and a list of movements.
 * Expected = openingFloat + Σ(inflows) - Σ(outflows)
 */
export function calcSessionExpectedCash(
  openingFloat: number,
  movements: POSMovement[],
): number {
  const delta = movements.reduce(
    (sum, m) => sum + m.amount * posMovementEffect(m.type),
    0,
  )
  return openingFloat + delta
}

/**
 * Calculate variance: actual - expected.
 * Positive = surplus (more cash than expected).
 * Negative = shortage.
 */
export function calcSessionVariance(expectedCash: number, actualCash: number): number {
  return actualCash - expectedCash
}

/** Returns true if variance exceeds tolerance threshold */
export function sessionHasVariance(variance: number, tolerance = 0): boolean {
  return Math.abs(variance) > tolerance
}

/** Running balance after applying a new movement to the current balance */
export function applyMovement(currentBalance: number, type: POSMovementType, amount: number): number {
  return currentBalance + amount * posMovementEffect(type)
}

/** Total of movements for a specific type */
export function totalByMovementType(movements: POSMovement[], type: POSMovementType): number {
  return movements.filter(m => m.type === type).reduce((s, m) => s + m.amount, 0)
}

/** Aggregate movements by type */
export function aggregateByMovementType(movements: POSMovement[]): Record<POSMovementType, number> {
  const result: Record<POSMovementType, number> = {
    FLOAT: 0, SALE: 0, REFUND: 0, PAY_IN: 0, PAY_OUT: 0,
  }
  for (const m of movements) {
    result[m.type] = (result[m.type] ?? 0) + m.amount
  }
  return result
}

/** Validate that a session transition is legal */
export function canTransitionSession(
  current: POSSessionStatus,
  next: POSSessionStatus,
): boolean {
  if (current === 'OPEN' && next === 'CLOSED') return true
  return false
}

/**
 * Build a Z-report (end-of-day summary) from a session and its movements.
 * Payment breakdown defaults to cash=totalSales (single-terminal cash POS).
 */
export function buildZReport(
  session: POSSession,
  movements: POSMovement[],
  paymentBreakdown: Partial<PaymentBreakdown> = {},
): ZReport {
  const agg = aggregateByMovementType(movements)
  const expectedCash = calcSessionExpectedCash(session.openingFloat, movements)
  const actualCash = session.status === 'CLOSED' ? session.actualCash : 0
  const variance = calcSessionVariance(expectedCash, actualCash)

  return {
    sessionId: session.id,
    terminalId: session.terminalId,
    openedAt: session.openedAt,
    closedAt: session.closedAt ?? null,
    status: session.status,
    openingFloat: session.openingFloat,
    totalSales: agg.SALE,
    totalRefunds: agg.REFUND,
    totalPayIn: agg.PAY_IN,
    totalPayOut: agg.PAY_OUT,
    totalFloat: agg.FLOAT,
    expectedCash,
    actualCash,
    variance,
    movementCount: movements.length,
    paymentBreakdown: {
      cash: paymentBreakdown.cash ?? agg.SALE,
      card: paymentBreakdown.card ?? 0,
      transfer: paymentBreakdown.transfer ?? 0,
      other: paymentBreakdown.other ?? 0,
    },
  }
}

/** Format variance label for display */
export function sessionVarianceLabel(variance: number): string {
  if (variance > 0) return `Surplus ${Math.abs(variance)}`
  if (variance < 0) return `Kekurangan ${Math.abs(variance)}`
  return 'Seimbang'
}
