import { describe, it, expect } from 'vitest'

// ─── Pure utility functions under test ────────────────────────────────────────
// These mirror the logic in the API route and loyalty lib.

/** Convert points to currency value. 100 points = Rp 1.000 (10 per point) */
function pointsToCurrency(points: number): number {
  if (points <= 0) return 0
  return points * 10
}

/** Convert currency amount to points required */
function currencyToPoints(amount: number): number {
  if (amount <= 0) return 0
  return Math.ceil(amount / 10)
}

interface RedemptionValidation {
  valid: boolean
  error?: string
  clampedPoints: number
}

/**
 * Validate a points redemption request at checkout.
 * Rules:
 *  - requestedPoints must be > 0
 *  - can't redeem more than customerPoints
 *  - discount can't make total negative (total must stay >= 0)
 *  - points must be whole numbers
 */
function validatePointsRedemption(
  requestedPoints: number,
  customerPoints: number,
  orderTotal: number,
): RedemptionValidation {
  if (!Number.isInteger(requestedPoints) || requestedPoints <= 0) {
    return { valid: false, error: 'requestedPoints must be a positive integer', clampedPoints: 0 }
  }
  const maxByBalance = customerPoints
  const maxByTotal = Math.floor(orderTotal / 10) // each point = Rp 10
  const maxAllowed = Math.min(maxByBalance, maxByTotal)
  if (requestedPoints > maxAllowed) {
    // Clamp instead of reject — caller decides whether to warn
    return { valid: true, clampedPoints: maxAllowed }
  }
  return { valid: true, clampedPoints: requestedPoints }
}

/** Calculate points earned for an order total (1 pt per Rp 1.000) */
function calcPointsEarned(orderTotal: number): number {
  if (orderTotal <= 0) return 0
  return Math.floor(orderTotal / 1000)
}

/** Points expiry: returns days until expiry given last activity date */
function calcDaysUntilExpiry(lastActivityISO: string | null, expiryMonths = 12): number | null {
  if (!lastActivityISO) return null
  const last = new Date(lastActivityISO)
  const expires = new Date(last)
  expires.setMonth(expires.getMonth() + expiryMonths)
  const now = new Date()
  return Math.ceil((expires.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

/** Generate a reward voucher code with a given prefix */
function generateVoucherCode(prefix = 'RWD'): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let code = `${prefix}-`
  for (let i = 0; i < 10; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

/** Deduct points from a balance — never below 0 */
function deductPoints(currentPoints: number, toDeduct: number): number {
  return Math.max(0, currentPoints - toDeduct)
}

// ─── 1. Points to currency conversion ────────────────────────────────────────

describe('pointsToCurrency', () => {
  it('converts 100 points to Rp 1.000', () => {
    expect(pointsToCurrency(100)).toBe(1000)
  })

  it('returns 0 for zero points', () => {
    expect(pointsToCurrency(0)).toBe(0)
  })

  it('returns 0 for negative points', () => {
    expect(pointsToCurrency(-5)).toBe(0)
  })

  it('converts 1 point to Rp 10', () => {
    expect(pointsToCurrency(1)).toBe(10)
  })
})

// ─── 2. Currency to points conversion ────────────────────────────────────────

describe('currencyToPoints', () => {
  it('converts Rp 1.000 to 100 points', () => {
    expect(currencyToPoints(1000)).toBe(100)
  })

  it('returns 0 for zero amount', () => {
    expect(currencyToPoints(0)).toBe(0)
  })

  it('ceils fractional result', () => {
    // Rp 15 / 10 = 1.5 → ceil → 2 points
    expect(currencyToPoints(15)).toBe(2)
  })
})

// ─── 3. Redemption validation — max points constraint ────────────────────────

describe('validatePointsRedemption — balance constraint', () => {
  it('allows redemption within balance', () => {
    const result = validatePointsRedemption(50, 200, 10000)
    expect(result.valid).toBe(true)
    expect(result.clampedPoints).toBe(50)
  })

  it('clamps to available balance when requested exceeds it', () => {
    const result = validatePointsRedemption(500, 100, 100000)
    expect(result.valid).toBe(true)
    expect(result.clampedPoints).toBe(100)
  })

  it('rejects zero or negative points', () => {
    expect(validatePointsRedemption(0, 100, 5000).valid).toBe(false)
    expect(validatePointsRedemption(-10, 100, 5000).valid).toBe(false)
  })
})

// ─── 4. Redemption validation — total can't go negative ──────────────────────

describe('validatePointsRedemption — min order constraint', () => {
  it('clamps points so total does not go negative', () => {
    // Order Rp 500, each point = Rp 10 → max 50 pts
    const result = validatePointsRedemption(200, 1000, 500)
    expect(result.valid).toBe(true)
    expect(result.clampedPoints).toBe(50) // floor(500 / 10) = 50
  })

  it('allows full coverage of order total', () => {
    // Order Rp 1000, max 100 pts → exactly Rp 1000 discount
    const result = validatePointsRedemption(100, 500, 1000)
    expect(result.valid).toBe(true)
    expect(result.clampedPoints).toBe(100)
  })
})

// ─── 5. Expiry calculation ────────────────────────────────────────────────────

describe('calcDaysUntilExpiry', () => {
  it('returns null when no last activity', () => {
    expect(calcDaysUntilExpiry(null)).toBeNull()
  })

  it('returns negative days for expired points', () => {
    // Activity 13 months ago → expired
    const pastDate = new Date()
    pastDate.setMonth(pastDate.getMonth() - 13)
    const days = calcDaysUntilExpiry(pastDate.toISOString())
    expect(days).not.toBeNull()
    expect(days!).toBeLessThan(0)
  })

  it('returns positive days for recently active customer', () => {
    // Activity 1 month ago → 11 months left
    const recentDate = new Date()
    recentDate.setMonth(recentDate.getMonth() - 1)
    const days = calcDaysUntilExpiry(recentDate.toISOString())
    expect(days).not.toBeNull()
    expect(days!).toBeGreaterThan(300)
  })

  it('respects custom expiry months', () => {
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
    const days3month = calcDaysUntilExpiry(sixMonthsAgo.toISOString(), 3)
    const days12month = calcDaysUntilExpiry(sixMonthsAgo.toISOString(), 12)
    expect(days3month!).toBeLessThan(days12month!)
  })
})

// ─── 6. Reward voucher generation ────────────────────────────────────────────

describe('generateVoucherCode', () => {
  it('starts with the expected prefix', () => {
    const code = generateVoucherCode('RWD')
    expect(code.startsWith('RWD-')).toBe(true)
  })

  it('has total length of 14 characters (RWD- + 10)', () => {
    const code = generateVoucherCode('RWD')
    expect(code.length).toBe(14)
  })

  it('generates unique codes on successive calls', () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateVoucherCode()))
    expect(codes.size).toBeGreaterThan(45) // allow minimal collision probability
  })

  it('uses only alphanumeric characters after prefix', () => {
    const code = generateVoucherCode('RWD')
    const suffix = code.replace('RWD-', '')
    expect(/^[A-Z0-9]+$/.test(suffix)).toBe(true)
  })
})

// ─── 7. Points deduction after redemption ────────────────────────────────────

describe('deductPoints', () => {
  it('deducts correctly', () => {
    expect(deductPoints(500, 100)).toBe(400)
  })

  it('never goes below 0', () => {
    expect(deductPoints(50, 100)).toBe(0)
  })

  it('deducts exactly to 0 when amounts match', () => {
    expect(deductPoints(100, 100)).toBe(0)
  })

  it('returns original balance when deducting 0', () => {
    expect(deductPoints(200, 0)).toBe(200)
  })
})

// ─── 8. Points earned calculation ────────────────────────────────────────────

describe('calcPointsEarned', () => {
  it('earns 1 point per Rp 1.000', () => {
    expect(calcPointsEarned(5000)).toBe(5)
  })

  it('floors partial thousands', () => {
    expect(calcPointsEarned(1500)).toBe(1)
  })

  it('returns 0 for zero order total', () => {
    expect(calcPointsEarned(0)).toBe(0)
  })

  it('returns 0 for negative order total', () => {
    expect(calcPointsEarned(-1000)).toBe(0)
  })
})
