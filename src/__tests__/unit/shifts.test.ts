import { describe, it, expect } from 'vitest'

// ── Shift business logic ───────────────────────────────────────────────────────

type ShiftStatus = 'OPEN' | 'CLOSED'

interface CashierSummary {
  cashierId: string
  cashierName: string
  salesCount: number
  salesTotal: number
  cashIn: number   // additional cash added during shift
  cashOut: number  // cash removed during shift
}

interface Shift {
  id: string
  storeId: string
  status: ShiftStatus
  openedBy: string
  openedAt: string
  closedAt?: string
  openingCash: number
  closingCash?: number
  expectedCash?: number
  cashiers: CashierSummary[]
}

// ── Pure functions ──────────────────────────────────────────────────────────────

function canOpenShift(existingShifts: Shift[]): { canOpen: boolean; reason?: string } {
  const openShift = existingShifts.find(s => s.status === 'OPEN')
  if (openShift) {
    return { canOpen: false, reason: `Shift sudah dibuka oleh ${openShift.openedBy}` }
  }
  return { canOpen: true }
}

function calcExpectedCash(shift: Shift, totalSales: number): number {
  const cashIn = shift.cashiers.reduce((sum, c) => sum + c.cashIn, 0)
  const cashOut = shift.cashiers.reduce((sum, c) => sum + c.cashOut, 0)
  return shift.openingCash + totalSales + cashIn - cashOut
}

function calcCashDifference(expectedCash: number, actualCash: number): number {
  return actualCash - expectedCash
}

function validateCashCount(amount: number): { valid: boolean; error?: string } {
  if (amount < 0) return { valid: false, error: 'Jumlah kas tidak boleh negatif' }
  if (!Number.isFinite(amount)) return { valid: false, error: 'Jumlah kas tidak valid' }
  return { valid: true }
}

function calcShiftDurationMinutes(shift: Shift): number | null {
  if (!shift.closedAt) return null
  const opened = new Date(shift.openedAt).getTime()
  const closed = new Date(shift.closedAt).getTime()
  return Math.round((closed - opened) / (1000 * 60))
}

function calcShiftSummary(shift: Shift): {
  totalSalesCount: number
  totalSalesAmount: number
  totalCashIn: number
  totalCashOut: number
} {
  return shift.cashiers.reduce(
    (acc, c) => ({
      totalSalesCount:  acc.totalSalesCount  + c.salesCount,
      totalSalesAmount: acc.totalSalesAmount + c.salesTotal,
      totalCashIn:      acc.totalCashIn      + c.cashIn,
      totalCashOut:     acc.totalCashOut     + c.cashOut,
    }),
    { totalSalesCount: 0, totalSalesAmount: 0, totalCashIn: 0, totalCashOut: 0 }
  )
}

function closeShift(shift: Shift, closingCash: number, closedAt: string): { ok: boolean; shift?: Shift; error?: string } {
  if (shift.status !== 'OPEN') {
    return { ok: false, error: 'Shift sudah ditutup' }
  }
  const validation = validateCashCount(closingCash)
  if (!validation.valid) {
    return { ok: false, error: validation.error }
  }
  const summary = calcShiftSummary(shift)
  const expected = calcExpectedCash(shift, summary.totalSalesAmount)
  return {
    ok: true,
    shift: {
      ...shift,
      status: 'CLOSED',
      closedAt,
      closingCash,
      expectedCash: expected,
    },
  }
}

// ── Tests ───────────────────────────────────────────────────────────────────────

const cashier1: CashierSummary = {
  cashierId: 'c1',
  cashierName: 'Andi',
  salesCount: 10,
  salesTotal: 500_000,
  cashIn: 0,
  cashOut: 0,
}

const cashier2: CashierSummary = {
  cashierId: 'c2',
  cashierName: 'Budi',
  salesCount: 8,
  salesTotal: 320_000,
  cashIn: 100_000,
  cashOut: 50_000,
}

const openShift: Shift = {
  id: 'shift-1',
  storeId: 'store-1',
  status: 'OPEN',
  openedBy: 'Andi',
  openedAt: '2025-06-01T08:00:00Z',
  openingCash: 200_000,
  cashiers: [cashier1],
}

describe('Shift open guard', () => {
  it('allows opening when no shift is currently open', () => {
    const result = canOpenShift([])
    expect(result.canOpen).toBe(true)
  })

  it('blocks opening when a shift is already open', () => {
    const result = canOpenShift([openShift])
    expect(result.canOpen).toBe(false)
    expect(result.reason).toContain('Andi')
  })

  it('allows opening when previous shift is closed', () => {
    const closedShift: Shift = { ...openShift, status: 'CLOSED' }
    const result = canOpenShift([closedShift])
    expect(result.canOpen).toBe(true)
  })

  it('blocks even when one of multiple shifts is open', () => {
    const closedShift: Shift = { ...openShift, id: 'shift-0', status: 'CLOSED' }
    const result = canOpenShift([closedShift, openShift])
    expect(result.canOpen).toBe(false)
  })
})

describe('Cash count validation at close', () => {
  it('accepts valid positive cash amount', () => {
    expect(validateCashCount(500_000).valid).toBe(true)
  })

  it('accepts zero cash amount', () => {
    expect(validateCashCount(0).valid).toBe(true)
  })

  it('rejects negative cash amount', () => {
    const result = validateCashCount(-1000)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('negatif')
  })

  it('rejects non-finite cash amount', () => {
    const result = validateCashCount(Infinity)
    expect(result.valid).toBe(false)
  })

  it('closeShift fails if shift is already closed', () => {
    const closed: Shift = { ...openShift, status: 'CLOSED' }
    const result = closeShift(closed, 700_000, '2025-06-01T16:00:00Z')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('ditutup')
  })
})

describe('Expected vs actual cash reconciliation', () => {
  it('calculates expected cash correctly', () => {
    // openingCash=200000 + salesTotal=500000 + cashIn=0 - cashOut=0
    const expected = calcExpectedCash(openShift, 500_000)
    expect(expected).toBe(700_000)
  })

  it('includes cashIn and cashOut from cashiers in expected cash', () => {
    const shift = { ...openShift, cashiers: [cashier2] }
    // openingCash=200000 + sales=320000 + cashIn=100000 - cashOut=50000 = 570000
    const expected = calcExpectedCash(shift, 320_000)
    expect(expected).toBe(570_000)
  })

  it('calculates cash difference — surplus', () => {
    expect(calcCashDifference(700_000, 750_000)).toBe(50_000)
  })

  it('calculates cash difference — shortage', () => {
    expect(calcCashDifference(700_000, 680_000)).toBe(-20_000)
  })

  it('closeShift records expectedCash on the closed shift', () => {
    const result = closeShift(openShift, 700_000, '2025-06-01T16:00:00Z')
    expect(result.ok).toBe(true)
    expect(result.shift?.expectedCash).toBe(700_000)
    expect(result.shift?.closingCash).toBe(700_000)
  })
})

describe('Shift duration calculation', () => {
  it('calculates shift duration in minutes', () => {
    const shift: Shift = {
      ...openShift,
      status: 'CLOSED',
      closedAt: '2025-06-01T16:00:00Z', // 8 hours = 480 minutes
    }
    expect(calcShiftDurationMinutes(shift)).toBe(480)
  })

  it('returns null for an open shift with no closedAt', () => {
    expect(calcShiftDurationMinutes(openShift)).toBeNull()
  })

  it('handles short shift duration correctly', () => {
    const shift: Shift = {
      ...openShift,
      status: 'CLOSED',
      openedAt: '2025-06-01T08:00:00Z',
      closedAt: '2025-06-01T08:30:00Z',
    }
    expect(calcShiftDurationMinutes(shift)).toBe(30)
  })
})

describe('Multi-cashier shift summary', () => {
  it('aggregates sales count from multiple cashiers', () => {
    const shift: Shift = { ...openShift, cashiers: [cashier1, cashier2] }
    const summary = calcShiftSummary(shift)
    expect(summary.totalSalesCount).toBe(18) // 10 + 8
  })

  it('aggregates sales total from multiple cashiers', () => {
    const shift: Shift = { ...openShift, cashiers: [cashier1, cashier2] }
    const summary = calcShiftSummary(shift)
    expect(summary.totalSalesAmount).toBe(820_000) // 500000 + 320000
  })

  it('aggregates cashIn and cashOut across cashiers', () => {
    const shift: Shift = { ...openShift, cashiers: [cashier1, cashier2] }
    const summary = calcShiftSummary(shift)
    expect(summary.totalCashIn).toBe(100_000)
    expect(summary.totalCashOut).toBe(50_000)
  })

  it('returns zeros for shift with no cashiers', () => {
    const shift: Shift = { ...openShift, cashiers: [] }
    const summary = calcShiftSummary(shift)
    expect(summary.totalSalesCount).toBe(0)
    expect(summary.totalSalesAmount).toBe(0)
  })
})
