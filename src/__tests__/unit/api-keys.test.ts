import { describe, it, expect } from 'vitest'
import {
  generateRawApiKey,
  extractKeyPrefix,
  hashApiKey,
  validateScopes,
  filterValidScopes,
  isKeyExpired,
  isKeyActive,
  validateWebhookEvents,
  filterValidWebhookEvents,
  getWebhooksForEvent,
  aggregateLogStatus,
  getRecentLogs,
  VALID_SCOPES,
  VALID_WEBHOOK_EVENTS,
} from '@/lib/api-keys'
import type { WebhookData, WebhookLogData } from '@/lib/api-keys'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const makeWebhook = (overrides: Partial<WebhookData> = {}): WebhookData => ({
  id: 'wh1',
  storeId: 's1',
  url: 'https://example.com/hook',
  events: ['order.created', 'payment.received'],
  secret: 'whsec_abc',
  active: true,
  lastTriggeredAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
})

const makeLog = (status: 'SUCCESS' | 'FAILED', createdAt = '2026-01-01T00:00:00.000Z'): WebhookLogData => ({
  id: Math.random().toString(36).slice(2),
  webhookId: 'wh1',
  storeId: 's1',
  event: 'order.created',
  payload: { orderId: 'ord1' },
  status,
  responseCode: status === 'SUCCESS' ? 200 : 500,
  createdAt,
})

// ── 1. Key prefix generation ──────────────────────────────────────────────────

describe('generateRawApiKey', () => {
  it('should produce a key starting with ksr_live_', () => {
    const key = generateRawApiKey()
    expect(key.startsWith('ksr_live_')).toBe(true)
  })

  it('should produce unique keys on each call', () => {
    const a = generateRawApiKey()
    const b = generateRawApiKey()
    expect(a).not.toBe(b)
  })

  it('should have at least 40 characters', () => {
    const key = generateRawApiKey()
    expect(key.length).toBeGreaterThanOrEqual(40)
  })
})

describe('extractKeyPrefix', () => {
  it('should return the first 16 characters of the key', () => {
    const key = 'ksr_live_abcdefghijklmnopqrstuvwxyz123456'
    expect(extractKeyPrefix(key)).toBe('ksr_live_abcdefg')
  })

  it('prefix from a generated key is 16 chars', () => {
    const key = generateRawApiKey()
    expect(extractKeyPrefix(key)).toHaveLength(16)
  })
})

describe('hashApiKey', () => {
  it('should produce a deterministic SHA-256 hash', () => {
    const key = 'ksr_live_test_key'
    const h1 = hashApiKey(key)
    const h2 = hashApiKey(key)
    expect(h1).toBe(h2)
  })

  it('should produce a 64-char hex string', () => {
    expect(hashApiKey('ksr_live_test')).toHaveLength(64)
  })

  it('different keys produce different hashes', () => {
    expect(hashApiKey('ksr_live_aaa')).not.toBe(hashApiKey('ksr_live_bbb'))
  })
})

// ── 2. Scope validation ───────────────────────────────────────────────────────

describe('validateScopes', () => {
  it('should accept all valid scopes', () => {
    expect(validateScopes(['orders:read', 'products:write'])).toBe(true)
  })

  it('should reject an unknown scope', () => {
    expect(validateScopes(['orders:read', 'admin:delete'])).toBe(false)
  })

  it('should reject an empty array', () => {
    expect(validateScopes([])).toBe(false)
  })

  it('should reject a non-array', () => {
    expect(validateScopes(null as any)).toBe(false)
  })
})

describe('filterValidScopes', () => {
  it('should strip invalid scopes and keep valid ones', () => {
    const result = filterValidScopes(['orders:read', 'hack:all', 'products:write'])
    expect(result).toEqual(['orders:read', 'products:write'])
  })

  it('should return empty array when all scopes are invalid', () => {
    expect(filterValidScopes(['admin:delete', 'root:access'])).toEqual([])
  })
})

// ── 3. Expiry check ───────────────────────────────────────────────────────────

describe('isKeyExpired', () => {
  it('should return false when expiresAt is null (no expiry)', () => {
    expect(isKeyExpired(null)).toBe(false)
  })

  it('should return true when expiresAt is in the past', () => {
    expect(isKeyExpired('2020-01-01T00:00:00.000Z')).toBe(true)
  })

  it('should return false when expiresAt is in the future', () => {
    expect(isKeyExpired('2099-12-31T23:59:59.000Z')).toBe(false)
  })

  it('should use the provided now parameter', () => {
    const now = new Date('2026-06-01T00:00:00.000Z')
    expect(isKeyExpired('2026-05-31T23:59:59.000Z', now)).toBe(true)
    expect(isKeyExpired('2026-06-02T00:00:00.000Z', now)).toBe(false)
  })
})

describe('isKeyActive', () => {
  it('should be active when active=true and no expiry', () => {
    expect(isKeyActive({ active: true, expiresAt: null })).toBe(true)
  })

  it('should be inactive when active=false', () => {
    expect(isKeyActive({ active: false, expiresAt: null })).toBe(false)
  })

  it('should be inactive when active=true but key is expired', () => {
    expect(isKeyActive({ active: true, expiresAt: '2020-01-01T00:00:00Z' })).toBe(false)
  })
})

// ── 4. Webhook event filtering ────────────────────────────────────────────────

describe('validateWebhookEvents', () => {
  it('should accept valid events', () => {
    expect(validateWebhookEvents(['order.created', 'stock.low'])).toBe(true)
  })

  it('should reject unknown events', () => {
    expect(validateWebhookEvents(['order.created', 'evil.hack'])).toBe(false)
  })

  it('should reject empty array', () => {
    expect(validateWebhookEvents([])).toBe(false)
  })
})

describe('filterValidWebhookEvents', () => {
  it('should keep valid events and drop invalid ones', () => {
    const result = filterValidWebhookEvents(['order.created', 'unknown.event', 'stock.low'])
    expect(result).toEqual(['order.created', 'stock.low'])
  })
})

describe('getWebhooksForEvent', () => {
  it('should return active webhooks that subscribe to the event', () => {
    const wh1 = makeWebhook({ id: 'wh1', events: ['order.created', 'stock.low'], active: true })
    const wh2 = makeWebhook({ id: 'wh2', events: ['payment.received'], active: true })
    const wh3 = makeWebhook({ id: 'wh3', events: ['order.created'], active: false })
    const result = getWebhooksForEvent([wh1, wh2, wh3], 'order.created')
    expect(result.map(w => w.id)).toEqual(['wh1'])
  })

  it('should return empty array when no webhooks match', () => {
    const wh = makeWebhook({ events: ['payment.received'] })
    expect(getWebhooksForEvent([wh], 'stock.low')).toHaveLength(0)
  })
})

// ── 5. Log status aggregation ─────────────────────────────────────────────────

describe('aggregateLogStatus', () => {
  it('should return zeros for empty log list', () => {
    const r = aggregateLogStatus([])
    expect(r).toEqual({ total: 0, success: 0, failed: 0, successRate: 0 })
  })

  it('should count successes and failures correctly', () => {
    const logs = [makeLog('SUCCESS'), makeLog('SUCCESS'), makeLog('FAILED')]
    const r = aggregateLogStatus(logs)
    expect(r.total).toBe(3)
    expect(r.success).toBe(2)
    expect(r.failed).toBe(1)
  })

  it('should compute successRate as percentage rounded to integer', () => {
    const logs = [makeLog('SUCCESS'), makeLog('SUCCESS'), makeLog('FAILED')]
    expect(aggregateLogStatus(logs).successRate).toBe(67)
  })

  it('should return 100% success rate when all succeed', () => {
    const logs = [makeLog('SUCCESS'), makeLog('SUCCESS')]
    expect(aggregateLogStatus(logs).successRate).toBe(100)
  })
})

describe('getRecentLogs', () => {
  it('should return logs sorted by createdAt descending', () => {
    const logs = [
      makeLog('SUCCESS', '2026-01-01T10:00:00Z'),
      makeLog('FAILED',  '2026-01-03T10:00:00Z'),
      makeLog('SUCCESS', '2026-01-02T10:00:00Z'),
    ]
    const result = getRecentLogs(logs, 10)
    expect(result[0].createdAt).toBe('2026-01-03T10:00:00Z')
    expect(result[1].createdAt).toBe('2026-01-02T10:00:00Z')
  })

  it('should limit result to specified count', () => {
    const logs = Array.from({ length: 20 }, (_, i) =>
      makeLog('SUCCESS', `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`)
    )
    expect(getRecentLogs(logs, 5)).toHaveLength(5)
  })
})
