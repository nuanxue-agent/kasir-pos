import { describe, it, expect } from 'vitest'

// ── Pure business-logic helpers (no I/O) ─────────────────────────────────────

/** Expected cash = opening float + cash sales + cash in - cash out */
function calcExpectedCash(
  openingFloat: number,
  cashSales: number,
  cashIn: number,
  cashOut: number,
): number {
  return openingFloat + cashSales + cashIn - cashOut
}

/** Variance = actual closing cash − expected closing cash */
function calcVariance(actual: number, expected: number): number {
  return actual - expected
}

/** Shift duration in minutes */
function calcShiftDuration(openedAt: string, closedAt: string): number {
  const ms = new Date(closedAt).getTime() - new Date(openedAt).getTime()
  return Math.round(ms / 60_000)
}

/** Validate opening float: must be non-negative number */
function validateOpeningFloat(value: unknown): { valid: boolean; error?: string } {
  if (typeof value !== 'number') return { valid: false, error: 'Must be a number' }
  if (value < 0) return { valid: false, error: 'Must be non-negative' }
  return { valid: true }
}

/** Validate a cash movement */
function validateMovement(
  type: unknown,
  amount: unknown,
): { valid: boolean; error?: string } {
  if (type !== 'IN' && type !== 'OUT') {
    return { valid: false, error: "Type must be 'IN' or 'OUT'" }
  }
  if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
    return { valid: false, error: 'Amount must be a positive number' }
  }
  return { valid: true }
}

/** Average order value */
function calcAvgOrderValue(totalSales: number, orderCount: number): number {
  if (orderCount === 0) return 0
  return totalSales / orderCount
}

/** Cash/card split from order list */
function calcPaymentSplit(orders: { paymentMethod: string; total: number }[]): {
  cash: number
  nonCash: number
} {
  let cash = 0
  let nonCash = 0
  for (const o of orders) {
    if (o.paymentMethod === 'CASH') cash += o.total
    else nonCash += o.total
  }
  return { cash, nonCash }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Expected cash calculation', () => {
  it('calculates expected cash with only opening float and cash sales', () => {
    expect(calcExpectedCash(200_000, 500_000, 0, 0)).toBe(700_000)
  })

  it('deducts cash out from expected cash', () => {
    expect(calcExpectedCash(200_000, 500_000, 0, 80_000)).toBe(620_000)
  })

  it('adds cash in to expected cash', () => {
    expect(calcExpectedCash(200_000, 500_000, 50_000, 0)).toBe(750_000)
  })

  it('combines opening float, sales, in and out', () => {
    // 100k float + 400k sales + 50k in - 30k out = 520k
    expect(calcExpectedCash(100_000, 400_000, 50_000, 30_000)).toBe(520_000)
  })

  it('returns opening float when no sales or movements', () => {
    expect(calcExpectedCash(150_000, 0, 0, 0)).toBe(150_000)
  })
})

describe('Variance calculation', () => {
  it('returns positive variance for cash overage', () => {
    expect(calcVariance(550_000, 500_000)).toBe(50_000)
  })

  it('returns negative variance for cash shortage', () => {
    expect(calcVariance(470_000, 500_000)).toBe(-30_000)
  })

  it('returns zero when actual equals expected', () => {
    expect(calcVariance(300_000, 300_000)).toBe(0)
  })
})

describe('Cash movement validation', () => {
  it('accepts a valid IN movement', () => {
    const result = validateMovement('IN', 50_000)
    expect(result.valid).toBe(true)
  })

  it('accepts a valid OUT movement', () => {
    const result = validateMovement('OUT', 20_000)
    expect(result.valid).toBe(true)
  })

  it('rejects invalid type', () => {
    const result = validateMovement('TRANSFER', 50_000)
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/IN.*OUT/i)
  })

  it('rejects zero amount', () => {
    const result = validateMovement('IN', 0)
    expect(result.valid).toBe(false)
  })

  it('rejects negative amount', () => {
    const result = validateMovement('OUT', -1000)
    expect(result.valid).toBe(false)
  })
})

describe('Shift duration calculation', () => {
  it('calculates a 4-hour shift correctly', () => {
    expect(calcShiftDuration('2024-01-15T08:00:00.000Z', '2024-01-15T12:00:00.000Z')).toBe(240)
  })

  it('returns 0 for same open and close time', () => {
    const t = '2024-01-15T10:00:00.000Z'
    expect(calcShiftDuration(t, t)).toBe(0)
  })
})

describe('Opening float validation', () => {
  it('accepts zero opening float', () => {
    expect(validateOpeningFloat(0).valid).toBe(true)
  })

  it('accepts a positive opening float', () => {
    expect(validateOpeningFloat(500_000).valid).toBe(true)
  })

  it('rejects negative opening float', () => {
    const r = validateOpeningFloat(-1)
    expect(r.valid).toBe(false)
    expect(r.error).toMatch(/non-negative/i)
  })

  it('rejects non-number opening float', () => {
    const r = validateOpeningFloat('500000')
    expect(r.valid).toBe(false)
    expect(r.error).toMatch(/number/i)
  })
})

describe('Shift summary helpers', () => {
  it('calculates average order value correctly', () => {
    expect(calcAvgOrderValue(600_000, 3)).toBe(200_000)
  })

  it('returns 0 average for empty shift', () => {
    expect(calcAvgOrderValue(0, 0)).toBe(0)
  })

  it('splits cash and non-cash payments', () => {
    const orders = [
      { paymentMethod: 'CASH', total: 100_000 },
      { paymentMethod: 'QRIS', total: 50_000 },
      { paymentMethod: 'CASH', total: 80_000 },
      { paymentMethod: 'CARD', total: 120_000 },
    ]
    const split = calcPaymentSplit(orders)
    expect(split.cash).toBe(180_000)
    expect(split.nonCash).toBe(170_000)
  })
})
