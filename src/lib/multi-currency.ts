// Pure business logic for multi-currency support — no DB deps, no Next.js imports

export interface Currency {
  id: string
  storeId: string
  code: string
  name: string
  symbol: string
  exchangeRate: number   // rate vs base currency (base = 1.0)
  isBase: boolean
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface ExchangeRateHistory {
  id: string
  storeId: string
  fromCurrency: string
  toCurrency: string
  rate: number
  recordedAt: string
}

// Rounding rules per currency (decimal places)
const CURRENCY_DECIMALS: Record<string, number> = {
  IDR: 0,   // Indonesian Rupiah — no decimals
  JPY: 0,   // Japanese Yen — no decimals
  KRW: 0,   // Korean Won — no decimals
  VND: 0,   // Vietnamese Dong — no decimals
  USD: 2,
  EUR: 2,
  SGD: 2,
  MYR: 2,
  GBP: 2,
  AUD: 2,
  THB: 2,
  PHP: 2,
  CNY: 2,
}

export function getDecimalsForCurrency(code: string): number {
  return CURRENCY_DECIMALS[code.toUpperCase()] ?? 2
}

/**
 * Convert amount from one currency to another using their exchange rates vs base.
 * exchangeRate is expressed as: N units of this currency = 1 USD (or other quote currency).
 * e.g. IDR base rate = 1.0, USD rate = 15800 means 1 USD costs 15800 IDR.
 * To convert: amount * fromRate / toRate
 * Example: 1 USD (fromRate=15800) → IDR (toRate=1.0): 1 * 15800 / 1.0 = 15800 IDR ✓
 * Example: 15800 IDR (fromRate=1.0) → USD (toRate=15800): 15800 * 1.0 / 15800 = 1 USD ✓
 */
export function convertAmount(
  amount: number,
  fromRate: number,
  toRate: number,
  toCurrencyCode: string,
): number {
  if (toRate <= 0) return 0
  const converted = (amount * fromRate) / toRate
  const decimals = getDecimalsForCurrency(toCurrencyCode)
  return roundToCurrency(converted, decimals)
}

export function roundToCurrency(amount: number, decimals: number): number {
  const factor = Math.pow(10, decimals)
  return Math.round(amount * factor) / factor
}

/**
 * Find the base currency in a list. Returns null if none marked as base.
 */
export function findBaseCurrency(currencies: Currency[]): Currency | null {
  return currencies.find(c => c.isBase && c.active) ?? null
}

/**
 * Get the cross rate to convert 1 unit of fromCode into toCode.
 * Rates are stored as: N units of currency = 1 base unit (IDR = 1.0, USD = 15800 means 1 USD costs 15800 IDR).
 * Cross rate = fromRate / toRate
 * Example: USD(15800) → SGD(11700): 15800 / 11700 ≈ 1.350 SGD per USD ✓
 * Example: IDR(1.0) → USD(15800): 1.0 / 15800 ≈ 0.0000633 USD per IDR ✓
 * Returns null if either currency is not found.
 */
export function getCrossRate(
  fromCode: string,
  toCode: string,
  currencies: Currency[],
): number | null {
  const from = currencies.find(c => c.code === fromCode)
  const to = currencies.find(c => c.code === toCode)
  if (!from || !to) return null
  if (to.exchangeRate <= 0) return null
  return from.exchangeRate / to.exchangeRate
}

/**
 * Convert an amount between two currencies given a currency list.
 * Returns null if either currency is unknown.
 */
export function convertBetween(
  amount: number,
  fromCode: string,
  toCode: string,
  currencies: Currency[],
): number | null {
  if (fromCode === toCode) {
    const decimals = getDecimalsForCurrency(toCode)
    return roundToCurrency(amount, decimals)
  }
  const rate = getCrossRate(fromCode, toCode, currencies)
  if (rate === null) return null
  const decimals = getDecimalsForCurrency(toCode)
  return roundToCurrency(amount * rate, decimals)
}

/**
 * Convert an amount to the base currency.
 */
export function toBaseCurrency(
  amount: number,
  fromCode: string,
  currencies: Currency[],
): number | null {
  const base = findBaseCurrency(currencies)
  if (!base) return null
  return convertBetween(amount, fromCode, base.code, currencies)
}

/**
 * Look up the most recent rate for a currency pair from history.
 */
export function getLatestRate(
  fromCurrency: string,
  toCurrency: string,
  history: ExchangeRateHistory[],
): ExchangeRateHistory | null {
  const matches = history
    .filter(h => h.fromCurrency === fromCurrency && h.toCurrency === toCurrency)
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
  return matches[0] ?? null
}

/**
 * Get rate history for a currency pair within an optional date range.
 */
export function filterRateHistory(
  fromCurrency: string,
  toCurrency: string,
  history: ExchangeRateHistory[],
  since?: string,
  until?: string,
): ExchangeRateHistory[] {
  return history
    .filter(h => {
      if (h.fromCurrency !== fromCurrency || h.toCurrency !== toCurrency) return false
      if (since && h.recordedAt < since) return false
      if (until && h.recordedAt > until) return false
      return true
    })
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))
}

/**
 * Validate that exactly one base currency exists and is active.
 */
export function validateBaseCurrency(currencies: Currency[]): { valid: boolean; error?: string } {
  const activeBases = currencies.filter(c => c.isBase && c.active)
  if (activeBases.length === 0) return { valid: false, error: 'No active base currency defined' }
  if (activeBases.length > 1) return { valid: false, error: 'Multiple base currencies found' }
  return { valid: true }
}

/**
 * Format an amount with currency symbol and correct decimal places.
 */
export function formatWithCurrency(amount: number, currency: Currency): string {
  const decimals = getDecimalsForCurrency(currency.code)
  return `${currency.symbol}${amount.toFixed(decimals)}`
}
