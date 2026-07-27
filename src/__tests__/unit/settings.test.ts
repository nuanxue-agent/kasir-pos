import { describe, it, expect, beforeEach } from 'vitest'
import {
  validateReceiptSettings,
  loadReceiptSettings,
  saveReceiptSettings,
  DEFAULT_RECEIPT_SETTINGS,
  DEFAULT_PAYMENT_METHODS,
  togglePaymentMethod,
  generateApiKey,
  validateWebhookUrl,
  type ReceiptSettings,
  type PaymentMethod,
} from '@/lib/receipt-settings'

// ── Receipt settings validation ───────────────────────────────────────────────

describe('validateReceiptSettings', () => {
  it('accepts valid settings with 80mm width', () => {
    const s: ReceiptSettings = { printWidth: 80, fontSize: 'medium', showLogo: true, footerText: 'Thanks!' }
    expect(validateReceiptSettings(s)).toBe(true)
  })

  it('accepts valid settings with 58mm width', () => {
    const s: ReceiptSettings = { printWidth: 58, fontSize: 'small', showLogo: false, footerText: '' }
    expect(validateReceiptSettings(s)).toBe(true)
  })

  it('rejects invalid printWidth', () => {
    const s = { printWidth: 72, fontSize: 'medium', showLogo: true, footerText: 'x' }
    expect(validateReceiptSettings(s)).toBe(false)
  })

  it('rejects invalid fontSize', () => {
    const s = { printWidth: 80, fontSize: 'huge', showLogo: true, footerText: 'x' }
    expect(validateReceiptSettings(s)).toBe(false)
  })

  it('rejects non-boolean showLogo', () => {
    const s = { printWidth: 80, fontSize: 'medium', showLogo: 'yes', footerText: 'x' }
    expect(validateReceiptSettings(s)).toBe(false)
  })

  it('rejects non-string footerText', () => {
    const s = { printWidth: 80, fontSize: 'medium', showLogo: true, footerText: 123 }
    expect(validateReceiptSettings(s)).toBe(false)
  })

  it('rejects null input', () => {
    expect(validateReceiptSettings(null)).toBe(false)
  })

  it('accepts all three fontSize values', () => {
    for (const fontSize of ['small', 'medium', 'large'] as const) {
      expect(validateReceiptSettings({ printWidth: 80, fontSize, showLogo: true, footerText: '' })).toBe(true)
    }
  })
})

// ── Payment method enable/disable logic ───────────────────────────────────────

describe('togglePaymentMethod', () => {
  it('disables an enabled method', () => {
    const result = togglePaymentMethod(DEFAULT_PAYMENT_METHODS, 'CASH')
    expect(result.CASH.enabled).toBe(false)
  })

  it('enables a disabled method', () => {
    const result = togglePaymentMethod(DEFAULT_PAYMENT_METHODS, 'GIFT_CARD')
    expect(result.GIFT_CARD.enabled).toBe(true)
  })

  it('does not mutate the original object', () => {
    const original = { ...DEFAULT_PAYMENT_METHODS }
    togglePaymentMethod(DEFAULT_PAYMENT_METHODS, 'QRIS')
    expect(DEFAULT_PAYMENT_METHODS.QRIS.enabled).toBe(original.QRIS.enabled)
  })

  it('preserves other methods when toggling one', () => {
    const result = togglePaymentMethod(DEFAULT_PAYMENT_METHODS, 'CASH')
    expect(result.CARD.enabled).toBe(DEFAULT_PAYMENT_METHODS.CARD.enabled)
    expect(result.QRIS.enabled).toBe(DEFAULT_PAYMENT_METHODS.QRIS.enabled)
    expect(result.TRANSFER.enabled).toBe(DEFAULT_PAYMENT_METHODS.TRANSFER.enabled)
  })

  it('preserves labels when toggling', () => {
    const result = togglePaymentMethod(DEFAULT_PAYMENT_METHODS, 'CASH')
    expect(result.CASH.label).toBe(DEFAULT_PAYMENT_METHODS.CASH.label)
  })
})

// ── API key generation ────────────────────────────────────────────────────────

describe('generateApiKey', () => {
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

  it('generates a valid UUID v4 format', () => {
    const key = generateApiKey()
    expect(key).toMatch(UUID_REGEX)
  })

  it('generates unique keys on each call', () => {
    const keys = new Set(Array.from({ length: 20 }, () => generateApiKey()))
    expect(keys.size).toBe(20)
  })

  it('generates a string of length 36', () => {
    expect(generateApiKey()).toHaveLength(36)
  })

  it('contains exactly 4 hyphens', () => {
    const key = generateApiKey()
    expect(key.split('-').length - 1).toBe(4)
  })
})

// ── Webhook URL validation ────────────────────────────────────────────────────

describe('validateWebhookUrl', () => {
  it('accepts a valid https URL', () => {
    expect(validateWebhookUrl('https://example.com/webhook')).toBe(true)
  })

  it('accepts a valid http URL', () => {
    expect(validateWebhookUrl('http://localhost:3000/webhook')).toBe(true)
  })

  it('rejects an invalid URL', () => {
    expect(validateWebhookUrl('not-a-url')).toBe(false)
  })

  it('rejects an ftp URL', () => {
    expect(validateWebhookUrl('ftp://example.com/webhook')).toBe(false)
  })

  it('accepts empty string (field is optional)', () => {
    expect(validateWebhookUrl('')).toBe(true)
  })
})
