/**
 * @module currency
 * Multi-currency support utilities.
 *
 * Provides exchange-rate lookups, amount conversion, and locale-aware
 * formatting for the five supported currencies (IDR, USD, SGD, MYR, EUR).
 * All functions are pure — no I/O, safe to use in tests and edge runtimes.
 */
// ─── Multi-currency support utilities ────────────────────────────────────────

export const SUPPORTED_CURRENCIES = ['IDR', 'USD', 'SGD', 'MYR', 'EUR'] as const
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number]

export interface ExchangeRate {
  id: string
  storeId: string
  fromCurrency: string
  toCurrency: string
  rate: number
  updatedAt: string
}

// Locale map for Intl.NumberFormat
const CURRENCY_LOCALE: Record<string, string> = {
  IDR: 'id-ID',
  USD: 'en-US',
  SGD: 'en-SG',
  MYR: 'ms-MY',
  EUR: 'de-DE',
}

/**
 * Look up the exchange rate for a given currency pair from the rates list.
 * Returns 1 when from === to.
 * Throws when no rate is found (explicit "missing rate" rather than silent wrong result).
 */
export function getRateForPair(rates: ExchangeRate[], from: string, to: string): number {
  if (from === to) return 1

  const direct = rates.find(r => r.fromCurrency === from && r.toCurrency === to)
  if (direct) return direct.rate

  // Try inverse
  const inverse = rates.find(r => r.fromCurrency === to && r.toCurrency === from)
  if (inverse && inverse.rate !== 0) return 1 / inverse.rate

  throw new Error(`No exchange rate found for ${from} → ${to}`)
}

/**
 * Convert an amount from one currency to another using stored rates.
 * Falls back to the original amount when no rate exists (safe degradation).
 */
export function convertAmount(
  amount: number,
  from: string,
  toCurrency: string,
  rates: ExchangeRate[],
): number {
  if (from === toCurrency) return amount
  try {
    const rate = getRateForPair(rates, from, toCurrency)
    return amount * rate
  } catch {
    return amount
  }
}

/**
 * Format an amount in a foreign (non-IDR) currency using that currency's locale.
 * Falls back to a generic en-US format for unknown currencies.
 */
export function formatCurrencyForeign(amount: number, currency: string): string {
  const locale = CURRENCY_LOCALE[currency] ?? 'en-US'
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: currency === 'IDR' ? 0 : 2,
    maximumFractionDigits: currency === 'IDR' ? 0 : 2,
  }).format(amount)
}
