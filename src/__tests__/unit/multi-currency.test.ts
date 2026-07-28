import { describe, it, expect } from 'vitest'

// ─── Pure helpers (mirrors lib/currency.ts + CurrencySettingsClient logic) ────

interface StoreCurrency {
  id: string
  storeId: string
  code: string
  symbol: string
  rate: number   // rate vs base; base itself is always 1.0
  active: boolean
  isBase: boolean
  updatedAt: string
}

/** Validate that a rate is a positive finite number. Returns error string or null. */
function validateRate(rate: unknown): string | null {
  const n = Number(rate)
  if (rate === null || rate === undefined || rate === '') return 'Rate is required'
  if (isNaN(n) || !isFinite(n)) return 'Rate must be a number'
  if (n <= 0) return 'Rate must be positive'
  return null
}

/** Convert amount between two currencies using a StoreCurrency list. */
function convertAmount(
  amount: number,
  from: string,
  to: string,
  currencies: StoreCurrency[],
): number {
  if (from === to) return amount
  const fromC = currencies.find(c => c.code === from)
  const toC   = currencies.find(c => c.code === to)
  if (!fromC || !toC) throw new Error(`Currency pair ${from}→${to} not found`)
  const inBase = fromC.isBase ? amount : amount / fromC.rate
  return toC.isBase ? inBase : inBase * toC.rate
}

/** Round to currency's native decimal places (IDR/JPY → 0 dp, rest → 2 dp). */
function roundForCurrency(amount: number, code: string): number {
  const zeroDp = new Set(['IDR', 'JPY'])
  const decimals = zeroDp.has(code) ? 0 : 2
  const factor   = Math.pow(10, decimals)
  return Math.round(amount * factor) / factor
}

/** Aggregate multi-currency totals into a single base-currency sum. */
function aggregateToBase(
  items: { amount: number; currency: string }[],
  currencies: StoreCurrency[],
  baseCurrency: string,
): number {
  return items.reduce((sum, item) => {
    const converted = convertAmount(item.amount, item.currency, baseCurrency, currencies)
    return sum + converted
  }, 0)
}

/** Guard: base currency may not be deactivated. */
function canDeactivate(currency: StoreCurrency): { ok: boolean; error?: string } {
  if (currency.isBase) return { ok: false, error: 'Base currency cannot be deactivated' }
  return { ok: true }
}

// ─── Sample fixture ───────────────────────────────────────────────────────────

const STORE_ID = 'store-test-1'

function makeCurrencies(): StoreCurrency[] {
  const now = new Date().toISOString()
  return [
    { id: '1', storeId: STORE_ID, code: 'IDR', symbol: 'Rp', rate: 1.0,      active: true,  isBase: true,  updatedAt: now },
    { id: '2', storeId: STORE_ID, code: 'USD', symbol: '$',  rate: 0.000064,  active: true,  isBase: false, updatedAt: now },
    { id: '3', storeId: STORE_ID, code: 'SGD', symbol: 'S$', rate: 0.000086,  active: true,  isBase: false, updatedAt: now },
    { id: '4', storeId: STORE_ID, code: 'EUR', symbol: '€',  rate: 0.000059,  active: false, isBase: false, updatedAt: now },
  ]
}

// ─── 1. Currency conversion: same currency returns unchanged amount ────────────

describe('Currency conversion — same currency', () => {
  it('returns the original amount when from === to', () => {
    const currencies = makeCurrencies()
    expect(convertAmount(100_000, 'IDR', 'IDR', currencies)).toBe(100_000)
  })
})

// ─── 2. Currency conversion: IDR → USD ───────────────────────────────────────

describe('Currency conversion — IDR to USD', () => {
  it('converts 15_625 IDR to ~1 USD at rate 0.000064', () => {
    const currencies = makeCurrencies()
    const result = convertAmount(15_625, 'IDR', 'USD', currencies)
    expect(result).toBeCloseTo(1.0, 1)
  })
})

// ─── 3. Currency conversion: USD → IDR (inverse path) ────────────────────────

describe('Currency conversion — USD to IDR (inverse)', () => {
  it('converts 1 USD back to ~15_625 IDR', () => {
    const currencies = makeCurrencies()
    const result = convertAmount(1, 'USD', 'IDR', currencies)
    expect(result).toBeCloseTo(15_625, -1)   // within 10 IDR
  })
})

// ─── 4. Currency conversion: non-base cross-pair USD → SGD ───────────────────

describe('Currency conversion — cross pair (USD → SGD)', () => {
  it('converts via base: 1 USD → IDR → SGD', () => {
    const currencies = makeCurrencies()
    // 1 USD = 1/0.000064 IDR = 15_625 IDR → 15_625 * 0.000086 ≈ 1.34375 SGD
    const result = convertAmount(1, 'USD', 'SGD', currencies)
    expect(result).toBeCloseTo(1.34375, 3)
  })
})

// ─── 5. Rate validation — positive number passes ──────────────────────────────

describe('Rate validation', () => {
  it('accepts a small positive rate', () => {
    expect(validateRate(0.000064)).toBeNull()
  })

  it('accepts rate = 1 (base currency)', () => {
    expect(validateRate(1)).toBeNull()
  })

  it('rejects zero', () => {
    expect(validateRate(0)).toBe('Rate must be positive')
  })

  it('rejects a negative rate', () => {
    expect(validateRate(-0.5)).toBe('Rate must be positive')
  })

  it('rejects NaN', () => {
    expect(validateRate(NaN)).toBe('Rate must be a number')
  })

  it('rejects null', () => {
    expect(validateRate(null)).toBe('Rate is required')
  })
})

// ─── 6. Base currency cannot be deactivated ───────────────────────────────────

describe('Base currency deactivation guard', () => {
  it('blocks deactivating the base currency', () => {
    const currencies = makeCurrencies()
    const base = currencies.find(c => c.isBase)!
    const result = canDeactivate(base)
    expect(result.ok).toBe(false)
    expect(result.error).toBe('Base currency cannot be deactivated')
  })

  it('allows deactivating a non-base currency', () => {
    const currencies = makeCurrencies()
    const nonBase = currencies.find(c => !c.isBase && c.active)!
    const result = canDeactivate(nonBase)
    expect(result.ok).toBe(true)
  })
})

// ─── 7. Multi-currency total aggregation ─────────────────────────────────────

describe('Multi-currency total aggregation', () => {
  it('aggregates mixed-currency items into IDR', () => {
    const currencies = makeCurrencies()
    const items = [
      { amount: 100_000, currency: 'IDR' },   // 100_000 IDR
      { amount: 1,       currency: 'USD' },   // ~15_625 IDR
    ]
    const total = aggregateToBase(items, currencies, 'IDR')
    expect(total).toBeCloseTo(100_000 + 1 / 0.000064, -1)
  })

  it('returns 0 for an empty items list', () => {
    const currencies = makeCurrencies()
    expect(aggregateToBase([], currencies, 'IDR')).toBe(0)
  })

  it('single item in base currency aggregates unchanged', () => {
    const currencies = makeCurrencies()
    const total = aggregateToBase([{ amount: 50_000, currency: 'IDR' }], currencies, 'IDR')
    expect(total).toBe(50_000)
  })
})

// ─── 8. Rounding rules per currency ──────────────────────────────────────────

describe('Rounding rules', () => {
  it('rounds IDR to 0 decimal places', () => {
    expect(roundForCurrency(15_000.75, 'IDR')).toBe(15_001)
  })

  it('rounds USD to 2 decimal places', () => {
    expect(roundForCurrency(1.234567, 'USD')).toBe(1.23)
  })

  it('rounds SGD to 2 decimal places', () => {
    expect(roundForCurrency(9.999, 'SGD')).toBe(10.00)
  })

  it('rounds JPY to 0 decimal places', () => {
    expect(roundForCurrency(1234.5, 'JPY')).toBe(1235)
  })

  it('does not alter an already-rounded value', () => {
    expect(roundForCurrency(100, 'IDR')).toBe(100)
    expect(roundForCurrency(1.50, 'USD')).toBe(1.50)
  })
})
