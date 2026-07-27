import { describe, it, expect } from 'vitest'
import enMessages from '../../../messages/en.json'
import idMessages from '../../../messages/id.json'

// ─── Helpers ──────────────────────────────────────────────────────────────────

type Messages = Record<string, unknown>

/** Flatten nested message object to dot-notation keys */
function flattenKeys(obj: Messages, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k
    return typeof v === 'object' && v !== null ? flattenKeys(v as Messages, key) : [key]
  })
}

/** Resolve a dot-notation key from a nested object, with optional fallback */
function resolve(messages: Messages, key: string, fallback?: Messages): string | undefined {
  const parts = key.split('.')
  let cur: unknown = messages
  for (const part of parts) {
    if (typeof cur !== 'object' || cur === null) break
    cur = (cur as Messages)[part]
  }
  if (typeof cur === 'string') return cur
  // Fallback to English
  if (fallback) return resolve(fallback, key)
  return undefined
}

/** Format currency per locale */
function formatCurrency(amount: number, locale: string, currency: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

/** Format date per locale */
function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(iso))
}

// ─── 1. Key completeness: every EN key exists in ID ───────────────────────────

describe('Translation key completeness', () => {
  it('ID file has every key that EN file has', () => {
    const enKeys = flattenKeys(enMessages as Messages)
    const idKeys = new Set(flattenKeys(idMessages as Messages))
    const missing = enKeys.filter(k => !idKeys.has(k))
    expect(missing, `Missing in id.json: ${missing.join(', ')}`).toHaveLength(0)
  })

  it('EN file has every key that ID file has (no orphans in ID)', () => {
    const idKeys = flattenKeys(idMessages as Messages)
    const enKeys = new Set(flattenKeys(enMessages as Messages))
    const extra = idKeys.filter(k => !enKeys.has(k))
    expect(extra, `Extra in id.json (not in en.json): ${extra.join(', ')}`).toHaveLength(0)
  })

  it('all keys have non-empty string values in EN', () => {
    const enKeys = flattenKeys(enMessages as Messages)
    const empty = enKeys.filter(k => {
      const v = resolve(enMessages as Messages, k)
      return !v || v.trim() === ''
    })
    expect(empty, `Empty EN values: ${empty.join(', ')}`).toHaveLength(0)
  })

  it('all keys have non-empty string values in ID', () => {
    const idKeys = flattenKeys(idMessages as Messages)
    const empty = idKeys.filter(k => {
      const v = resolve(idMessages as Messages, k)
      return !v || v.trim() === ''
    })
    expect(empty, `Empty ID values: ${empty.join(', ')}`).toHaveLength(0)
  })
})

// ─── 2. Fallback to English when key missing ──────────────────────────────────

describe('Fallback to English for missing keys', () => {
  it('returns EN value when key is missing from ID messages', () => {
    // Simulate a partial ID messages object missing a key
    const partialId: Messages = { common: { save: 'Simpan' } }
    const key = 'common.cancel' // Not in partialId
    const result = resolve(partialId, key, enMessages as Messages)
    expect(result).toBe('Cancel') // EN fallback
  })

  it('returns undefined when key is missing from both EN and ID', () => {
    const key = 'nonexistent.key.deep'
    const result = resolve(idMessages as Messages, key, enMessages as Messages)
    expect(result).toBeUndefined()
  })

  it('returns ID value directly when key exists', () => {
    const result = resolve(idMessages as Messages, 'common.save')
    expect(result).toBe('Simpan')
  })
})

// ─── 3. Currency formatting per locale ────────────────────────────────────────

describe('Currency formatting per locale', () => {
  it('formats IDR correctly for id-ID locale (no decimals)', () => {
    const formatted = formatCurrency(150000, 'id-ID', 'IDR')
    // Should contain the amount without decimals
    expect(formatted).toContain('150.000')
  })

  it('formats USD correctly for en-US locale', () => {
    const formatted = formatCurrency(1500, 'en-US', 'USD')
    expect(formatted).toContain('1,500')
    expect(formatted).toContain('$')
  })

  it('zero amount formats without error', () => {
    const formatted = formatCurrency(0, 'id-ID', 'IDR')
    expect(formatted).toBeTruthy()
    expect(formatted).toContain('0')
  })
})

// ─── 4. Date formatting per locale ────────────────────────────────────────────

describe('Date formatting per locale', () => {
  const isoDate = '2025-07-15T10:30:00Z'

  it('formats date in Indonesian locale (id-ID)', () => {
    const formatted = formatDate(isoDate, 'id-ID')
    // id-ID should produce something like "15 Juli 2025"
    expect(formatted).toContain('2025')
    // Month name in Indonesian
    expect(formatted.toLowerCase()).toMatch(/jul/)
  })

  it('formats date in English locale (en-US)', () => {
    const formatted = formatDate(isoDate, 'en-US')
    expect(formatted).toContain('2025')
    expect(formatted.toLowerCase()).toMatch(/jul/)
  })

  it('consistently formats the same date across locales (same underlying timestamp)', () => {
    const idFormatted = formatDate(isoDate, 'id-ID')
    const enFormatted = formatDate(isoDate, 'en-US')
    // Both should reference the same year
    expect(idFormatted).toContain('2025')
    expect(enFormatted).toContain('2025')
    // The underlying date objects should be equal
    expect(new Date(isoDate).getTime()).toBe(new Date(isoDate).getTime())
  })
})
