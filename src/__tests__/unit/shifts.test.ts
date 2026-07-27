import { describe, it, expect } from 'vitest'

// ── Pure business-logic helpers (no I/O) ─────────────────────────────────────

/** Returns shift duration in minutes */
function calcShiftDuration(openedAt: string, closedAt: string): number {
  const ms = new Date(closedAt).getTime() - new Date(openedAt).getTime()
  return Math.round(ms / 60_000)
}

/** Cash variance = actual closing cash − expected closing cash */
function calcCashVariance(actual: number, expected: number): number {
  return actual - expected
}

/** Expected closing cash = opening + cash sales − expenses */
function calcExpectedCash(opening: number, cashSales: number, expenses: number): number {
  return opening + cashSales - expenses
}

/** Net cash flow = cash sales − expenses */
function calcNetCashFlow(cashSales: number, expenses: number): number {
  return cashSales - expenses
}

/** Total sales = sum of all payment amounts */
function calcTotalSales(payments: { amount: number }[]): number {
  return payments.reduce((s, p) => s + p.amount, 0)
}

/** Payment breakdown by method */
function calcPaymentBreakdown(
  payments: { method: string; amount: number }[],
): Record<string, number> {
  return payments.reduce(
    (acc, p) => {
      acc[p.method] = (acc[p.method] ?? 0) + p.amount
      return acc
    },
    {} as Record<string, number>,
  )
}

/** Determine if variance is acceptable (within tolerance) */
function isVarianceAcceptable(variance: number, tolerance = 1000): boolean {
  return Math.abs(variance) < tolerance
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Shift duration calculation', () => {
  it('calculates duration for a 4-hour shift', () => {
    const opened = '2024-01-15T08:00:00.000Z'
    const closed = '2024-01-15T12:00:00.000Z'
    expect(calcShiftDuration(opened, closed)).toBe(240)
  })

  it('calculates duration for a 30-minute shift', () => {
    const opened = '2024-01-15T09:00:00.000Z'
    const closed = '2024-01-15T09:30:00.000Z'
    expect(calcShiftDuration(opened, closed)).toBe(30)
  })

  it('returns 0 for same open and close time', () => {
    const t = '2024-01-15T10:00:00.000Z'
    expect(calcShiftDuration(t, t)).toBe(0)
  })
})

describe('Cash variance calculation', () => {
  it('returns positive variance when actual exceeds expected (overage)', () => {
    expect(calcCashVariance(500_000, 480_000)).toBe(20_000)
  })

  it('returns negative variance when actual is less than expected (shortage)', () => {
    expect(calcCashVariance(470_000, 500_000)).toBe(-30_000)
  })

  it('returns zero when actual equals expected', () => {
    expect(calcCashVariance(300_000, 300_000)).toBe(0)
  })

  it('flags large variance as unacceptable', () => {
    const variance = calcCashVariance(450_000, 500_000) // -50_000
    expect(isVarianceAcceptable(variance)).toBe(false)
  })

  it('accepts small variance within tolerance', () => {
    const variance = calcCashVariance(300_500, 300_000) // +500
    expect(isVarianceAcceptable(variance)).toBe(true)
  })
})

describe('Sales total during shift', () => {
  it('sums all payment amounts', () => {
    const payments = [
      { method: 'CASH', amount: 100_000 },
      { method: 'QRIS', amount: 50_000 },
      { method: 'CARD', amount: 75_000 },
    ]
    expect(calcTotalSales(payments)).toBe(225_000)
  })

  it('returns 0 for empty payments', () => {
    expect(calcTotalSales([])).toBe(0)
  })

  it('groups payment breakdown by method', () => {
    const payments = [
      { method: 'CASH', amount: 100_000 },
      { method: 'CASH', amount: 50_000 },
      { method: 'QRIS', amount: 75_000 },
    ]
    const breakdown = calcPaymentBreakdown(payments)
    expect(breakdown['CASH']).toBe(150_000)
    expect(breakdown['QRIS']).toBe(75_000)
    expect(breakdown['CARD']).toBeUndefined()
  })
})

describe('Net cash flow calculation', () => {
  it('calculates net cash flow correctly', () => {
    expect(calcNetCashFlow(500_000, 80_000)).toBe(420_000)
  })

  it('calculates expected closing cash', () => {
    // opening 200k + sales 500k − expenses 80k = 620k
    expect(calcExpectedCash(200_000, 500_000, 80_000)).toBe(620_000)
  })

  it('handles negative net flow when expenses exceed cash sales', () => {
    expect(calcNetCashFlow(50_000, 200_000)).toBe(-150_000)
  })

  it('calculates expected cash with zero expenses', () => {
    expect(calcExpectedCash(100_000, 300_000, 0)).toBe(400_000)
  })
})
