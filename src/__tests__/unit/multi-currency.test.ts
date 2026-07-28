import { describe, it, expect } from 'vitest'
import {
  convertAmount,
  convertBetween,
  findBaseCurrency,
  getCrossRate,
  getDecimalsForCurrency,
  roundToCurrency,
  toBaseCurrency,
  getLatestRate,
  filterRateHistory,
  validateBaseCurrency,
} from '@/lib/multi-currency'
import type { Currency, ExchangeRateHistory } from '@/lib/multi-currency'

// --- Fixtures ---
const idr: Currency = {
  id: 'c1', storeId: 's1', code: 'IDR', name: 'Indonesian Rupiah', symbol: 'Rp',
  exchangeRate: 1.0, isBase: true, active: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
}
const usd: Currency = {
  id: 'c2', storeId: 's1', code: 'USD', name: 'US Dollar', symbol: '$',
  exchangeRate: 15800.0, isBase: false, active: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
}
const sgd: Currency = {
  id: 'c3', storeId: 's1', code: 'SGD', name: 'Singapore Dollar', symbol: 'S$',
  exchangeRate: 11700.0, isBase: false, active: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
}
const eur: Currency = {
  id: 'c4', storeId: 's1', code: 'EUR', name: 'Euro', symbol: '€',
  exchangeRate: 17200.0, isBase: false, active: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
}
const jpy: Currency = {
  id: 'c5', storeId: 's1', code: 'JPY', name: 'Japanese Yen', symbol: '¥',
  exchangeRate: 106.0, isBase: false, active: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
}
const inactiveCurrency: Currency = {
  id: 'c6', storeId: 's1', code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM',
  exchangeRate: 3500.0, isBase: false, active: false, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
}

const allCurrencies = [idr, usd, sgd, eur, jpy, inactiveCurrency]

const historyEntries: ExchangeRateHistory[] = [
  { id: 'h1', storeId: 's1', fromCurrency: 'IDR', toCurrency: 'USD', rate: 15500, recordedAt: '2026-01-01T10:00:00Z' },
  { id: 'h2', storeId: 's1', fromCurrency: 'IDR', toCurrency: 'USD', rate: 15700, recordedAt: '2026-01-15T10:00:00Z' },
  { id: 'h3', storeId: 's1', fromCurrency: 'IDR', toCurrency: 'USD', rate: 15800, recordedAt: '2026-02-01T10:00:00Z' },
  { id: 'h4', storeId: 's1', fromCurrency: 'IDR', toCurrency: 'SGD', rate: 11500, recordedAt: '2026-01-10T08:00:00Z' },
  { id: 'h5', storeId: 's1', fromCurrency: 'IDR', toCurrency: 'SGD', rate: 11700, recordedAt: '2026-02-05T08:00:00Z' },
]

// ============================================================
// 1. Currency conversion calculation
// convertAmount(amount, fromRate, toRate, toCurrencyCode)
// Rates stored as: N units of currency per 1 base unit
//   IDR (base) = 1.0, USD = 15800 (1 USD costs 15800 IDR)
// Formula: amount * fromRate / toRate
// ============================================================
describe('convertAmount', () => {
  it('converts IDR to USD: 15800 IDR → 1 USD', () => {
    // 15800 IDR (fromRate=1.0) → USD (toRate=15800)
    // = 15800 * 1.0 / 15800 = 1.00
    const result = convertAmount(15800, 1.0, 15800, 'USD')
    expect(result).toBe(1.00)
  })

  it('converts USD to SGD via cross rate', () => {
    // 1 USD (fromRate=15800) → SGD (toRate=11700)
    // = 1 * 15800 / 11700 ≈ 1.35 SGD
    const result = convertAmount(1, 15800, 11700, 'SGD')
    expect(result).toBeCloseTo(1.35, 2)
  })

  it('returns 0 when toRate is zero (guard against division by zero)', () => {
    expect(convertAmount(1000, 15800, 0, 'USD')).toBe(0)
  })

  it('applies correct rounding for IDR (0 decimals)', () => {
    // 1.5 USD (fromRate=15800) → IDR (toRate=1.0)
    // = 1.5 * 15800 / 1.0 = 23700 IDR
    const result = convertAmount(1.5, 15800, 1.0, 'IDR')
    expect(result).toBe(23700)
  })

  it('applies correct rounding for USD (2 decimals)', () => {
    // 1.2345 * 1.0 / 1.0 = 1.2345 → rounds to 1.23 USD
    const result = convertAmount(1.2345, 1.0, 1.0, 'USD')
    expect(result).toBe(1.23)
  })
})

// ============================================================
// 2. Base currency detection
// ============================================================
describe('findBaseCurrency', () => {
  it('finds the base currency in a list', () => {
    const base = findBaseCurrency(allCurrencies)
    expect(base).not.toBeNull()
    expect(base!.code).toBe('IDR')
    expect(base!.isBase).toBe(true)
  })

  it('returns null when no base currency exists', () => {
    const noBases = [usd, sgd, eur]
    expect(findBaseCurrency(noBases)).toBeNull()
  })

  it('ignores inactive base currencies', () => {
    const inactiveBase: Currency = { ...idr, active: false }
    expect(findBaseCurrency([inactiveBase, usd])).toBeNull()
  })
})

// ============================================================
// 3. Rounding rules per currency
// ============================================================
describe('getDecimalsForCurrency', () => {
  it('returns 0 decimals for IDR', () => {
    expect(getDecimalsForCurrency('IDR')).toBe(0)
  })

  it('returns 0 decimals for JPY', () => {
    expect(getDecimalsForCurrency('JPY')).toBe(0)
  })

  it('returns 2 decimals for USD', () => {
    expect(getDecimalsForCurrency('USD')).toBe(2)
  })

  it('returns 2 decimals for EUR', () => {
    expect(getDecimalsForCurrency('EUR')).toBe(2)
  })

  it('returns 2 decimals for unknown currencies (safe default)', () => {
    expect(getDecimalsForCurrency('XYZ')).toBe(2)
  })
})

describe('roundToCurrency', () => {
  it('rounds to 0 decimal places correctly', () => {
    expect(roundToCurrency(15800.6, 0)).toBe(15801)
    expect(roundToCurrency(15800.4, 0)).toBe(15800)
  })

  it('rounds to 2 decimal places correctly', () => {
    expect(roundToCurrency(1.2345, 2)).toBe(1.23)
    expect(roundToCurrency(1.2355, 2)).toBe(1.24)
  })
})

// ============================================================
// 4. Rate history lookup
// ============================================================
describe('getLatestRate', () => {
  it('returns the most recent rate entry for a pair', () => {
    const latest = getLatestRate('IDR', 'USD', historyEntries)
    expect(latest).not.toBeNull()
    expect(latest!.rate).toBe(15800)
    expect(latest!.recordedAt).toBe('2026-02-01T10:00:00Z')
  })

  it('returns null when no history exists for the pair', () => {
    const result = getLatestRate('IDR', 'EUR', historyEntries)
    expect(result).toBeNull()
  })

  it('returns correct latest when multiple entries exist for different pairs', () => {
    const latestSGD = getLatestRate('IDR', 'SGD', historyEntries)
    expect(latestSGD).not.toBeNull()
    expect(latestSGD!.rate).toBe(11700)
  })
})

describe('filterRateHistory', () => {
  it('filters history by currency pair', () => {
    const results = filterRateHistory('IDR', 'USD', historyEntries)
    expect(results).toHaveLength(3)
    results.forEach(r => {
      expect(r.fromCurrency).toBe('IDR')
      expect(r.toCurrency).toBe('USD')
    })
  })

  it('filters by date range (since)', () => {
    const results = filterRateHistory('IDR', 'USD', historyEntries, '2026-01-16T00:00:00Z')
    expect(results).toHaveLength(1)
    expect(results[0].rate).toBe(15800)
  })

  it('returns results sorted ascending by recordedAt', () => {
    const results = filterRateHistory('IDR', 'USD', historyEntries)
    expect(results[0].rate).toBe(15500)
    expect(results[2].rate).toBe(15800)
  })
})

// ============================================================
// 5. Cross-rate calculation
// getCrossRate: fromRate / toRate
// Rates: N currency units per 1 base (IDR=1, USD=15800, SGD=11700)
// USD→SGD: 15800/11700 ≈ 1.350 (1 USD buys ~1.35 SGD)
// IDR→USD: 1.0/15800 ≈ 0.0000633
// ============================================================
describe('getCrossRate', () => {
  it('calculates USD to SGD cross rate', () => {
    // USD=15800, SGD=11700 → 15800/11700 ≈ 1.3504
    const rate = getCrossRate('USD', 'SGD', allCurrencies)
    expect(rate).not.toBeNull()
    expect(rate!).toBeCloseTo(1.3504, 3)
  })

  it('returns 1 when converting a currency to itself', () => {
    const rate = getCrossRate('USD', 'USD', allCurrencies)
    expect(rate).toBe(1)
  })

  it('returns null for an unknown currency code', () => {
    expect(getCrossRate('USD', 'XYZ', allCurrencies)).toBeNull()
    expect(getCrossRate('ABC', 'USD', allCurrencies)).toBeNull()
  })
})

describe('convertBetween', () => {
  it('converts IDR to USD correctly', () => {
    // 158000 IDR → USD: getCrossRate('IDR','USD') = 1.0/15800
    // 158000 * (1/15800) = 10 USD
    const result = convertBetween(158000, 'IDR', 'USD', allCurrencies)
    expect(result).toBe(10.00)
  })

  it('converts USD to SGD cross-currency', () => {
    // getCrossRate('USD','SGD') = 15800/11700 ≈ 1.3504
    // 1 USD → 1.35 SGD
    const result = convertBetween(1, 'USD', 'SGD', allCurrencies)
    expect(result).toBeCloseTo(1.35, 2)
  })

  it('returns null for unknown currency', () => {
    expect(convertBetween(100, 'USD', 'XYZ', allCurrencies)).toBeNull()
  })

  it('same currency conversion returns the same amount (with correct rounding)', () => {
    // IDR same-to-same: 15800.7 → rounds to 0 decimals → 15801
    const result = convertBetween(15800.7, 'IDR', 'IDR', allCurrencies)
    expect(result).toBe(15801)
  })
})

describe('toBaseCurrency', () => {
  it('converts USD amount to IDR base currency', () => {
    // getCrossRate('USD', 'IDR') = usd.rate / idr.rate = 15800 / 1.0 = 15800
    // 1 USD * 15800 = 15800 IDR
    const result = toBaseCurrency(1, 'USD', allCurrencies)
    expect(result).toBe(15800)
  })

  it('converts SGD to IDR base currency', () => {
    // getCrossRate('SGD', 'IDR') = 11700 / 1.0 = 11700
    // 2 SGD * 11700 = 23400 IDR
    const result = toBaseCurrency(2, 'SGD', allCurrencies)
    expect(result).toBe(23400)
  })

  it('returns null when no base currency is defined', () => {
    const noBases = [usd, sgd]
    expect(toBaseCurrency(100, 'USD', noBases)).toBeNull()
  })
})

// ============================================================
// 6. Validate base currency
// ============================================================
describe('validateBaseCurrency', () => {
  it('is valid when exactly one active base exists', () => {
    expect(validateBaseCurrency(allCurrencies).valid).toBe(true)
  })

  it('is invalid when no base currency exists', () => {
    const result = validateBaseCurrency([usd, sgd])
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/no active base/i)
  })

  it('is invalid when multiple base currencies exist', () => {
    const twoBase: Currency[] = [
      idr,
      { ...usd, isBase: true },
    ]
    const result = validateBaseCurrency(twoBase)
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/multiple/i)
  })
})
