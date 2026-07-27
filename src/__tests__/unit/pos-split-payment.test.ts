import { describe, it, expect } from 'vitest'

// ── Business logic for split payment ─────────────────────────────────────────

type PaymentMethod = 'CASH' | 'CARD' | 'TRANSFER' | 'QRIS' | 'OTHER'

interface PaymentLine {
  method: PaymentMethod
  amount: number
}

/** Sum all payment lines */
function totalPaid(payments: PaymentLine[]): number {
  return payments.reduce((sum, p) => sum + p.amount, 0)
}

/** Validate that total paid covers order total */
function isPaymentSufficient(payments: PaymentLine[], orderTotal: number): boolean {
  return totalPaid(payments) >= orderTotal
}

/** Validate that every payment line has amount > 0 */
function allLinesHaveAmount(payments: PaymentLine[]): boolean {
  return payments.length > 0 && payments.every(p => p.amount > 0)
}

/**
 * Change only applies to cash. Returns the overpay in cash after all
 * non-cash lines have contributed their share.
 */
function calcCashChange(payments: PaymentLine[], orderTotal: number): number {
  const nonCashTotal = payments
    .filter(p => p.method !== 'CASH')
    .reduce((sum, p) => sum + p.amount, 0)
  const cashLines = payments.filter(p => p.method === 'CASH')
  if (cashLines.length === 0) return 0
  const cashPaid = cashLines.reduce((sum, p) => sum + p.amount, 0)
  const remainingAfterNonCash = Math.max(0, orderTotal - nonCashTotal)
  return Math.max(0, cashPaid - remainingAfterNonCash)
}

/** Validate minimum payment amount per line (must be > 0) */
function validateMinimumAmounts(payments: PaymentLine[]): { valid: boolean; invalidIndexes: number[] } {
  const invalidIndexes = payments.reduce<number[]>((acc, p, i) => {
    if (p.amount <= 0) acc.push(i)
    return acc
  }, [])
  return { valid: invalidIndexes.length === 0, invalidIndexes }
}

/** Build payment payload — omits zero-amount lines */
function buildPaymentPayload(payments: PaymentLine[], orderTotal: number) {
  return payments.map(p => ({
    method: p.method,
    amount: p.amount,
    change: p.method === 'CASH' ? calcCashChange([p], orderTotal - (totalPaid(payments) - p.amount)) : 0,
  }))
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Split Payment — validation', () => {
  it('rejects when single payment is less than order total', () => {
    const payments: PaymentLine[] = [{ method: 'CASH', amount: 40000 }]
    expect(isPaymentSufficient(payments, 50000)).toBe(false)
  })

  it('accepts when single payment equals order total', () => {
    const payments: PaymentLine[] = [{ method: 'CASH', amount: 50000 }]
    expect(isPaymentSufficient(payments, 50000)).toBe(true)
  })

  it('accepts when single payment exceeds order total (overpay)', () => {
    const payments: PaymentLine[] = [{ method: 'CASH', amount: 60000 }]
    expect(isPaymentSufficient(payments, 50000)).toBe(true)
  })

  it('rejects when split lines sum is less than order total', () => {
    const payments: PaymentLine[] = [
      { method: 'CASH', amount: 20000 },
      { method: 'QRIS', amount: 20000 },
    ]
    expect(isPaymentSufficient(payments, 50000)).toBe(false)
  })
})

describe('Split Payment — multiple methods summing', () => {
  it('sums two payment lines correctly', () => {
    const payments: PaymentLine[] = [
      { method: 'CASH', amount: 25000 },
      { method: 'QRIS', amount: 25000 },
    ]
    expect(totalPaid(payments)).toBe(50000)
  })

  it('three payment lines sum to order total', () => {
    const payments: PaymentLine[] = [
      { method: 'CASH', amount: 20000 },
      { method: 'CARD', amount: 15000 },
      { method: 'QRIS', amount: 15000 },
    ]
    expect(totalPaid(payments)).toBe(50000)
    expect(isPaymentSufficient(payments, 50000)).toBe(true)
  })

  it('returns correct total across four lines', () => {
    const payments: PaymentLine[] = [
      { method: 'CASH', amount: 10000 },
      { method: 'CARD', amount: 10000 },
      { method: 'QRIS', amount: 10000 },
      { method: 'TRANSFER', amount: 10000 },
    ]
    expect(totalPaid(payments)).toBe(40000)
  })
})

describe('Split Payment — change calculation (cash only)', () => {
  it('no change when no cash line', () => {
    const payments: PaymentLine[] = [{ method: 'QRIS', amount: 60000 }]
    expect(calcCashChange(payments, 50000)).toBe(0)
  })

  it('change equals overpay on a cash-only transaction', () => {
    const payments: PaymentLine[] = [{ method: 'CASH', amount: 60000 }]
    expect(calcCashChange(payments, 50000)).toBe(10000)
  })

  it('change only applies to cash portion when split with QRIS', () => {
    // QRIS covers 30000, cash covers 25000 on a 50000 order → cash change = 25000 - 20000 = 5000
    const payments: PaymentLine[] = [
      { method: 'QRIS', amount: 30000 },
      { method: 'CASH', amount: 25000 },
    ]
    expect(calcCashChange(payments, 50000)).toBe(5000)
  })

  it('returns 0 when cash exactly covers its portion', () => {
    const payments: PaymentLine[] = [
      { method: 'QRIS', amount: 25000 },
      { method: 'CASH', amount: 25000 },
    ]
    expect(calcCashChange(payments, 50000)).toBe(0)
  })
})

describe('Split Payment — minimum amount validation', () => {
  it('rejects a line with zero amount', () => {
    const payments: PaymentLine[] = [
      { method: 'CASH', amount: 0 },
      { method: 'QRIS', amount: 50000 },
    ]
    const result = validateMinimumAmounts(payments)
    expect(result.valid).toBe(false)
    expect(result.invalidIndexes).toContain(0)
  })

  it('rejects a line with negative amount', () => {
    const payments: PaymentLine[] = [{ method: 'CASH', amount: -1000 }]
    const result = validateMinimumAmounts(payments)
    expect(result.valid).toBe(false)
  })

  it('passes when all lines have positive amounts', () => {
    const payments: PaymentLine[] = [
      { method: 'CASH', amount: 30000 },
      { method: 'QRIS', amount: 20000 },
    ]
    const result = validateMinimumAmounts(payments)
    expect(result.valid).toBe(true)
    expect(result.invalidIndexes).toHaveLength(0)
  })
})
