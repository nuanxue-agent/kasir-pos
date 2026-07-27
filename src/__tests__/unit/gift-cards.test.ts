import { describe, it, expect } from 'vitest'
import {
  generateGiftCardCode,
  deductGiftCardBalance,
  resolveGiftCardStatus,
  validateGiftCardRedemption,
  applyGiftCardToOrder,
  isValidGiftCardCode,
} from '@/lib/gift-cards'

// ─── generateGiftCardCode ─────────────────────────────────────────────────────

describe('generateGiftCardCode', () => {
  it('generates a 16-character code', () => {
    expect(generateGiftCardCode()).toHaveLength(16)
  })

  it('only contains uppercase letters and digits', () => {
    const code = generateGiftCardCode()
    expect(/^[A-Z0-9]{16}$/.test(code)).toBe(true)
  })

  it('generates unique codes on successive calls', () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateGiftCardCode()))
    // Extremely unlikely for any two of 50 codes to collide
    expect(codes.size).toBe(50)
  })
})

// ─── deductGiftCardBalance ────────────────────────────────────────────────────

describe('deductGiftCardBalance', () => {
  it('deducts the exact amount when balance is sufficient', () => {
    const { newBalance, applied } = deductGiftCardBalance(100_000, 50_000)
    expect(applied).toBe(50_000)
    expect(newBalance).toBe(50_000)
  })

  it('caps applied amount at the current balance (overpayment scenario)', () => {
    const { newBalance, applied } = deductGiftCardBalance(30_000, 100_000)
    expect(applied).toBe(30_000)
    expect(newBalance).toBe(0)
  })

  it('returns zero applied and unchanged balance for zero amount', () => {
    const { newBalance, applied } = deductGiftCardBalance(50_000, 0)
    expect(applied).toBe(0)
    expect(newBalance).toBe(50_000)
  })

  it('returns zero applied and zero balance when balance is already 0', () => {
    const { newBalance, applied } = deductGiftCardBalance(0, 50_000)
    expect(applied).toBe(0)
    expect(newBalance).toBe(0)
  })
})

// ─── resolveGiftCardStatus ────────────────────────────────────────────────────

describe('resolveGiftCardStatus', () => {
  it('returns ACTIVE for positive balance and future expiry', () => {
    const future = new Date(Date.now() + 86_400_000).toISOString()
    expect(resolveGiftCardStatus(50_000, future)).toBe('ACTIVE')
  })

  it('returns EXPIRED when expiresAt is in the past even with balance remaining', () => {
    const past = new Date(Date.now() - 86_400_000).toISOString()
    expect(resolveGiftCardStatus(50_000, past)).toBe('EXPIRED')
  })

  it('returns USED when balance is zero', () => {
    expect(resolveGiftCardStatus(0, null)).toBe('USED')
  })

  it('returns ACTIVE when no expiry is set', () => {
    expect(resolveGiftCardStatus(10_000, null)).toBe('ACTIVE')
  })
})

// ─── validateGiftCardRedemption ───────────────────────────────────────────────

describe('validateGiftCardRedemption', () => {
  it('returns null for a valid redemption', () => {
    expect(validateGiftCardRedemption('ACTIVE', 50_000, 20_000)).toBeNull()
  })

  it('returns error for EXPIRED card', () => {
    expect(validateGiftCardRedemption('EXPIRED', 50_000, 20_000)).not.toBeNull()
  })

  it('returns error for USED card', () => {
    expect(validateGiftCardRedemption('USED', 0, 10_000)).not.toBeNull()
  })

  it('returns error when requestedAmount is zero or negative', () => {
    expect(validateGiftCardRedemption('ACTIVE', 50_000, 0)).not.toBeNull()
    expect(validateGiftCardRedemption('ACTIVE', 50_000, -100)).not.toBeNull()
  })
})

// ─── applyGiftCardToOrder (overpayment / partial) ─────────────────────────────

describe('applyGiftCardToOrder', () => {
  it('covers partial order when card balance is less than total', () => {
    const { appliedAmount, remainingBalance } = applyGiftCardToOrder(100_000, 60_000)
    expect(appliedAmount).toBe(60_000)
    expect(remainingBalance).toBe(0)
  })

  it('covers full order and returns remaining balance when card > total', () => {
    const { appliedAmount, remainingBalance } = applyGiftCardToOrder(50_000, 100_000)
    expect(appliedAmount).toBe(50_000)
    expect(remainingBalance).toBe(50_000)
  })

  it('covers exact order total leaving zero remaining balance', () => {
    const { appliedAmount, remainingBalance } = applyGiftCardToOrder(75_000, 75_000)
    expect(appliedAmount).toBe(75_000)
    expect(remainingBalance).toBe(0)
  })
})

// ─── isValidGiftCardCode ──────────────────────────────────────────────────────

describe('isValidGiftCardCode', () => {
  it('accepts a valid 16-char uppercase alphanumeric code', () => {
    expect(isValidGiftCardCode('ABCD1234EFGH5678')).toBe(true)
  })

  it('rejects a code shorter than 16 chars', () => {
    expect(isValidGiftCardCode('ABCD1234')).toBe(false)
  })

  it('rejects a code with lowercase letters', () => {
    expect(isValidGiftCardCode('abcd1234efgh5678')).toBe(false)
  })

  it('rejects a code with special characters', () => {
    expect(isValidGiftCardCode('ABCD-1234-EFGH56')).toBe(false)
  })
})
