import { describe, it, expect } from 'vitest'
import {
  buildWebhookPayload,
  generateWebhookSecret,
  signWebhookPayload,
  verifyWebhookSignature,
  validateWebhookEndpointUrl,
  filterValidEvents,
  shouldRetryDelivery,
  retryDelay,
  SUPPORTED_WEBHOOK_EVENTS,
} from '@/lib/webhook-utils'

// ─── 1. Payload construction ──────────────────────────────────────────────────

describe('buildWebhookPayload', () => {
  it('includes required envelope fields', () => {
    const p = buildWebhookPayload('order.created', { orderId: '123' })
    expect(p).toHaveProperty('id')
    expect(p).toHaveProperty('event', 'order.created')
    expect(p).toHaveProperty('timestamp')
    expect(p).toHaveProperty('data')
    expect(p.data).toMatchObject({ orderId: '123' })
  })

  it('timestamp is a valid ISO string', () => {
    const p = buildWebhookPayload('order.paid', {})
    expect(() => new Date(p.timestamp)).not.toThrow()
    expect(new Date(p.timestamp).toISOString()).toBe(p.timestamp)
  })

  it('generates unique ids for each payload', () => {
    const ids = new Set(Array.from({ length: 10 }, () => buildWebhookPayload('order.created', {}).id))
    expect(ids.size).toBe(10)
  })
})

// ─── 2. Event filtering ───────────────────────────────────────────────────────

describe('filterValidEvents', () => {
  it('returns only supported events', () => {
    const result = filterValidEvents(['order.created', 'unknown.event', 'order.paid'])
    expect(result).toEqual(['order.created', 'order.paid'])
  })

  it('returns empty array when no valid events', () => {
    expect(filterValidEvents(['foo.bar', 'baz'])).toEqual([])
  })

  it('supports all four documented events', () => {
    const all = [...SUPPORTED_WEBHOOK_EVENTS]
    expect(filterValidEvents(all)).toEqual(all)
  })
})

// ─── 3. HMAC signature generation ────────────────────────────────────────────

describe('signWebhookPayload', () => {
  it('produces a hex string', () => {
    const secret = generateWebhookSecret()
    const sig = signWebhookPayload('{"event":"order.created"}', secret)
    expect(sig).toMatch(/^[0-9a-f]{64}$/)
  })

  it('same input + secret produces same signature (deterministic)', () => {
    const secret = 'whsec_' + 'a'.repeat(64)
    const payload = '{"event":"order.paid"}'
    expect(signWebhookPayload(payload, secret)).toBe(signWebhookPayload(payload, secret))
  })

  it('different payloads produce different signatures', () => {
    const secret = generateWebhookSecret()
    const s1 = signWebhookPayload('payload-a', secret)
    const s2 = signWebhookPayload('payload-b', secret)
    expect(s1).not.toBe(s2)
  })

  it('verifyWebhookSignature returns true for valid signature', () => {
    const secret = generateWebhookSecret()
    const payload = JSON.stringify(buildWebhookPayload('order.created', { id: '1' }))
    const sig = signWebhookPayload(payload, secret)
    expect(verifyWebhookSignature(payload, secret, sig)).toBe(true)
  })

  it('verifyWebhookSignature returns false for tampered payload', () => {
    const secret = generateWebhookSecret()
    const payload = '{"event":"order.created"}'
    const sig = signWebhookPayload(payload, secret)
    expect(verifyWebhookSignature('{"event":"order.paid"}', secret, sig)).toBe(false)
  })
})

// ─── 4. Delivery retry logic ─────────────────────────────────────────────────

describe('shouldRetryDelivery', () => {
  it('retries on network failure (null responseCode)', () => {
    expect(shouldRetryDelivery(null, 0)).toBe(true)
    expect(shouldRetryDelivery(null, 1)).toBe(true)
  })

  it('retries on 5xx server errors', () => {
    expect(shouldRetryDelivery(500, 0)).toBe(true)
    expect(shouldRetryDelivery(503, 1)).toBe(true)
  })

  it('does NOT retry on 4xx client errors', () => {
    expect(shouldRetryDelivery(400, 0)).toBe(false)
    expect(shouldRetryDelivery(404, 0)).toBe(false)
    expect(shouldRetryDelivery(422, 0)).toBe(false)
  })

  it('stops retrying after maxAttempts', () => {
    expect(shouldRetryDelivery(500, 3)).toBe(false)
    expect(shouldRetryDelivery(null, 3)).toBe(false)
  })

  it('retryDelay grows exponentially and is capped at 30s', () => {
    expect(retryDelay(0)).toBe(1000)
    expect(retryDelay(1)).toBe(2000)
    expect(retryDelay(2)).toBe(4000)
    expect(retryDelay(10)).toBe(30_000) // capped
  })
})

// ─── 5. URL validation ────────────────────────────────────────────────────────

describe('validateWebhookEndpointUrl', () => {
  it('accepts https URLs', () => {
    expect(validateWebhookEndpointUrl('https://example.com/hook')).toBe(true)
  })

  it('accepts http URLs', () => {
    expect(validateWebhookEndpointUrl('http://localhost:3000/hook')).toBe(true)
  })

  it('rejects non-URL strings', () => {
    expect(validateWebhookEndpointUrl('not-a-url')).toBe(false)
    expect(validateWebhookEndpointUrl('')).toBe(false)
  })

  it('rejects non-http protocols', () => {
    expect(validateWebhookEndpointUrl('ftp://files.example.com')).toBe(false)
    expect(validateWebhookEndpointUrl('ws://example.com')).toBe(false)
  })
})
