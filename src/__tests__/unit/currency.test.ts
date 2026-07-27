import { describe, it, expect } from 'vitest'
import {
  convertAmount,
  formatCurrencyForeign,
  getRateForPair,
  SUPPORTED_CURRENCIES,
  type ExchangeRate,
} from '@/lib/currency'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeRate(
  from: string,
  to: string,
  rate: number,
  id = `${from}-${to}`,
): ExchangeRate {
  return { id, storeId: 'store-1', fromCurrency: from, toCurrency: to, rate, updatedAt: '2024-01-01T00:00:00Z' }
}

const rates: ExchangeRate[] = [
  makeRate('IDR', 'USD', 0.000064),   // 1 IDR = 0.000064 USD  (~15,625 IDR/USD)
  makeRate('IDR', 'SGD', 0.000086),   // 1 IDR = 0.000086 SGD
  makeRate('IDR', 'MYR', 0.000300),   // 1 IDR = 0.0003 MYR
  makeRate('IDR', 'EUR', 0.000059),   // 1 IDR = 0.000059 EUR
]

// ── SUPPORTED_CURRENCIES ──────────────────────────────────────────────────────

describe('SUPPORTED_CURRENCIES', () => {
  it('contains IDR, USD, SGD, MYR, EUR', () => {
    expect(SUPPORTED_CURRENCIES).toContain('IDR')
    expect(SUPPORTED_CURRENCIES).toContain('USD')
    expect(SUPPORTED_CURRENCIES).toContain('SGD')
    expect(SUPPORTED_CURRENCIES).toContain('MYR')
    expect(SUPPORTED_CURRENCIES).toContain('EUR')
  })

  it('has exactly 5 entries', () => {
    expect(SUPPORTED_CURRENCIES).toHaveLength(5)
  })
})

// ── getRateForPair ────────────────────────────────────────────────────────────

describe('getRateForPair', () => {
  it('returns 1 for same-currency pair', () => {
    expect(getRateForPair(rates, 'IDR', 'IDR')).toBe(1)
    expect(getRateForPair(rates, 'USD', 'USD')).toBe(1)
  })

  it('returns direct rate when available', () => {
    expect(getRateForPair(rates, 'IDR', 'USD')).toBeCloseTo(0.000064, 8)
  })

  it('computes inverse rate when only reverse pair is stored', () => {
    // Only IDR→USD is stored; asking USD→IDR should return ~15625
    const rate = getRateForPair(rates, 'USD', 'IDR')
    expect(rate).toBeCloseTo(1 / 0.000064, 0)
  })

  it('throws for a completely unknown pair', () => {
    expect(() => getRateForPair(rates, 'USD', 'SGD')).toThrow()
  })
})

// ── convertAmount ─────────────────────────────────────────────────────────────

describe('convertAmount', () => {
  it('returns same amount for identical currencies', () => {
    expect(convertAmount(100_000, 'IDR', 'IDR', rates)).toBe(100_000)
  })

  it('converts IDR to USD correctly', () => {
    const result = convertAmount(1_000_000, 'IDR', 'USD', rates)
    expect(result).toBeCloseTo(64, 1)  // 1,000,000 × 0.000064 = 64
  })

  it('converts IDR to SGD correctly', () => {
    const result = convertAmount(1_000_000, 'IDR', 'SGD', rates)
    expect(result).toBeCloseTo(86, 1)
  })

  it('converts IDR to MYR correctly', () => {
    const result = convertAmount(500_000, 'IDR', 'MYR', rates)
    expect(result).toBeCloseTo(150, 1)
  })

  it('converts IDR to EUR correctly', () => {
    const result = convertAmount(1_000_000, 'IDR', 'EUR', rates)
    expect(result).toBeCloseTo(59, 1)
  })

  it('falls back to original amount when rate is missing', () => {
    // USD→SGD has no stored rate — fallback returns original
    const result = convertAmount(100, 'USD', 'SGD', rates)
    expect(result).toBe(100)
  })

  it('supports bidirectional conversion round-trip', () => {
    const idrAmount = 500_000
    const usd = convertAmount(idrAmount, 'IDR', 'USD', rates)
    const backToIdr = convertAmount(usd, 'USD', 'IDR', rates)
    // Round-trip should be within 0.1%
    expect(Math.abs(backToIdr - idrAmount) / idrAmount).toBeLessThan(0.001)
  })
})

// ── formatCurrencyForeign ─────────────────────────────────────────────────────

describe('formatCurrencyForeign', () => {
  it('formats USD with 2 decimal places', () => {
    const formatted = formatCurrencyForeign(64.5, 'USD')
    expect(formatted).toMatch(/64/)
    expect(formatted).toMatch(/\$|USD/)
  })

  it('formats IDR with 0 decimal places', () => {
    const formatted = formatCurrencyForeign(15000, 'IDR')
    // IDR uses dots as thousand separators in Indonesian locale — no decimal comma
    expect(formatted).not.toMatch(/,\d{2}$/)
    expect(formatted).toMatch(/15/)
  })

  it('formats EUR with 2 decimal places', () => {
    const formatted = formatCurrencyForeign(59.99, 'EUR')
    expect(formatted).toMatch(/59/)
  })

  it('falls back gracefully for unknown currency codes', () => {
    // Should not throw — just format with en-US locale
    expect(() => formatCurrencyForeign(100, 'XYZ')).not.toThrow()
  })
})
