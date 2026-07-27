import { describe, it, expect } from 'vitest'

// ── Customer validation & business logic ──────────────────────────────────────
// Pure functions extracted from the customer module for unit testing.

// ─── Validation helpers ───────────────────────────────────────────────────────

function validateCustomerName(name: string): string | null {
  if (!name || name.trim().length < 2) return 'Name must be at least 2 characters'
  return null
}

function validatePhone(phone: string): string | null {
  if (!phone) return null // optional
  // Accepts formats: +62..., 08..., 62..., digits only, min 8 digits
  const cleaned = phone.replace(/[\s\-().]/g, '')
  if (!/^(\+62|62|0)[0-9]{7,13}$/.test(cleaned)) {
    return 'Invalid phone number format'
  }
  return null
}

function validateEmail(email: string | undefined): string | null {
  if (!email || email.trim() === '') return null // optional field
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email.trim())) return 'Invalid email format'
  return null
}

// ─── Points logic ─────────────────────────────────────────────────────────────

/** Award 1 point per 1000 currency units spent */
function calculatePointsEarned(totalAmount: number): number {
  if (totalAmount <= 0) return 0
  return Math.floor(totalAmount / 1000)
}

/** Net points change after a purchase (earned minus redeemed) */
function calculateNetPoints(
  currentPoints: number,
  earned: number,
  redeemed: number
): number {
  const net = earned - redeemed
  return Math.max(0, currentPoints + net)
}

// ─── Tier logic ───────────────────────────────────────────────────────────────

type Tier = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM'

const TIER_THRESHOLDS: Array<{ tier: Tier; min: number }> = [
  { tier: 'PLATINUM', min: 10_000 },
  { tier: 'GOLD',    min: 5_000 },
  { tier: 'SILVER',  min: 1_000 },
  { tier: 'BRONZE',  min: 0 },
]

function assignTier(totalPoints: number): Tier {
  for (const { tier, min } of TIER_THRESHOLDS) {
    if (totalPoints >= min) return tier
  }
  return 'BRONZE'
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Customer name validation', () => {
  it('accepts a valid name with 2+ characters', () => {
    expect(validateCustomerName('Budi')).toBeNull()
  })

  it('rejects a name with fewer than 2 characters', () => {
    expect(validateCustomerName('A')).toBe('Name must be at least 2 characters')
  })

  it('rejects an empty string', () => {
    expect(validateCustomerName('')).toBe('Name must be at least 2 characters')
  })
})

describe('Phone number validation', () => {
  it('accepts a valid Indonesian number with +62 prefix', () => {
    expect(validatePhone('+6281234567890')).toBeNull()
  })

  it('accepts a number starting with 08', () => {
    expect(validatePhone('081234567890')).toBeNull()
  })

  it('accepts a number starting with 62', () => {
    expect(validatePhone('6281234567890')).toBeNull()
  })

  it('returns null for empty phone (field is optional)', () => {
    expect(validatePhone('')).toBeNull()
  })

  it('rejects a clearly invalid phone number', () => {
    expect(validatePhone('abc-not-a-phone')).toBe('Invalid phone number format')
  })
})

describe('Email validation (optional field)', () => {
  it('accepts a valid email', () => {
    expect(validateEmail('budi@example.com')).toBeNull()
  })

  it('returns null when email is empty (field is optional)', () => {
    expect(validateEmail('')).toBeNull()
    expect(validateEmail(undefined)).toBeNull()
  })

  it('rejects an email without @ sign', () => {
    expect(validateEmail('notanemail')).toBe('Invalid email format')
  })
})

describe('Points calculation after purchase', () => {
  it('awards 1 point per 1000 units', () => {
    expect(calculatePointsEarned(50_000)).toBe(50)
  })

  it('floors partial thousands', () => {
    expect(calculatePointsEarned(1_999)).toBe(1)
  })

  it('returns 0 for zero or negative amounts', () => {
    expect(calculatePointsEarned(0)).toBe(0)
    expect(calculatePointsEarned(-500)).toBe(0)
  })

  it('calculates net points after redeeming', () => {
    // customer has 100 pts, earns 50, redeems 30 → 120
    expect(calculateNetPoints(100, 50, 30)).toBe(120)
  })

  it('never goes below 0 points', () => {
    expect(calculateNetPoints(10, 0, 50)).toBe(0)
  })
})

describe('Tier assignment based on total points', () => {
  it('assigns BRONZE for 0 total points', () => {
    expect(assignTier(0)).toBe('BRONZE')
  })

  it('assigns SILVER at 1000 points', () => {
    expect(assignTier(1_000)).toBe('SILVER')
  })

  it('assigns GOLD at 5000 points', () => {
    expect(assignTier(5_000)).toBe('GOLD')
  })

  it('assigns PLATINUM at 10000 points', () => {
    expect(assignTier(10_000)).toBe('PLATINUM')
  })

  it('assigns GOLD for a value between GOLD and PLATINUM', () => {
    expect(assignTier(7_500)).toBe('GOLD')
  })
})
