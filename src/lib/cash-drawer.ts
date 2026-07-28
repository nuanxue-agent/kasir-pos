// Pure business logic for cash drawer & EOD reconciliation — no DB deps

export type MovementType = 'SALE' | 'REFUND' | 'PAYOUT' | 'FLOAT_ADD'
export type DrawerStatus = 'OPEN' | 'CLOSED'

export interface CashMovement {
  id: string
  drawerId: string
  storeId: string
  type: MovementType
  amount: number
  reference?: string | null
  note?: string | null
  createdAt: string
}

export interface CashDrawer {
  id: string
  storeId: string
  shiftId?: string | null
  openedAt: string
  closedAt?: string | null
  openingFloat: number
  expectedCash: number
  actualCash: number
  variance: number
  closedBy?: string | null
  status: DrawerStatus
}

export interface EODReport {
  drawerId: string
  openingFloat: number
  totalSales: number
  totalRefunds: number
  totalPayouts: number
  totalFloatAdds: number
  expectedCash: number
  actualCash: number
  variance: number
  movementCount: number
  status: DrawerStatus
}

/** Amount effect of each movement type on cash in drawer */
export function movementEffect(type: MovementType): number {
  switch (type) {
    case 'SALE':      return 1
    case 'FLOAT_ADD': return 1
    case 'REFUND':    return -1
    case 'PAYOUT':    return -1
  }
}

/**
 * Calculate expected cash given an opening float and a list of movements.
 * Expected = openingFloat + SUM(sales) + SUM(float_adds) - SUM(refunds) - SUM(payouts)
 */
export function calcExpectedCash(openingFloat: number, movements: CashMovement[]): number {
  const delta = movements.reduce((sum, m) => sum + m.amount * movementEffect(m.type), 0)
  return openingFloat + delta
}

/**
 * Calculate variance: actual - expected.
 * Positive = surplus, negative = shortage.
 */
export function calcVariance(expectedCash: number, actualCash: number): number {
  return actualCash - expectedCash
}

/** Aggregate movements by type, returning totals for each type */
export function aggregateByType(movements: CashMovement[]): Record<MovementType, number> {
  const result: Record<MovementType, number> = {
    SALE: 0, REFUND: 0, PAYOUT: 0, FLOAT_ADD: 0,
  }
  for (const m of movements) {
    result[m.type] = (result[m.type] ?? 0) + m.amount
  }
  return result
}

/** Total of a specific movement type */
export function totalByType(movements: CashMovement[], type: MovementType): number {
  return movements.filter(m => m.type === type).reduce((s, m) => s + m.amount, 0)
}

/** Returns true if variance is outside the tolerance threshold (default ±0) */
export function hasVariance(variance: number, tolerance = 0): boolean {
  return Math.abs(variance) > tolerance
}

/** Build a full EOD report from a drawer and its movements */
export function buildEODReport(drawer: CashDrawer, movements: CashMovement[]): EODReport {
  const agg = aggregateByType(movements)
  const expectedCash = calcExpectedCash(drawer.openingFloat, movements)
  const actualCash = drawer.status === 'CLOSED' ? drawer.actualCash : 0
  const variance = calcVariance(expectedCash, actualCash)

  return {
    drawerId: drawer.id,
    openingFloat: drawer.openingFloat,
    totalSales: agg.SALE,
    totalRefunds: agg.REFUND,
    totalPayouts: agg.PAYOUT,
    totalFloatAdds: agg.FLOAT_ADD,
    expectedCash,
    actualCash,
    variance,
    movementCount: movements.length,
    status: drawer.status,
  }
}

/** Format variance for display: surplus/shortage/balanced */
export function varianceLabel(variance: number): string {
  if (variance > 0) return `Surplus ${variance}`
  if (variance < 0) return `Kekurangan ${Math.abs(variance)}`
  return 'Seimbang'
}
