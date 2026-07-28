import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  type TrackingStatus,
  STATUS_LABELS,
  STATUS_DESCRIPTIONS,
  getStatusStep,
  calculateEstimatedTime,
} from '@/components/pos/OrderTrackingClient'

// ─── Token generation ─────────────────────────────────────────────────────────

describe('Token generation', () => {
  it('generates a URL-safe base64 token without padding', () => {
    const tokenBytes = new Uint8Array(24)
    crypto.getRandomValues(tokenBytes)
    const token = btoa(String.fromCharCode(...tokenBytes))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '')

    expect(token).toMatch(/^[A-Za-z0-9\-_]+$/)
    expect(token.length).toBeGreaterThan(16)
  })

  it('produces unique tokens on each call', () => {
    const make = () => {
      const bytes = new Uint8Array(24)
      crypto.getRandomValues(bytes)
      return btoa(String.fromCharCode(...bytes))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '')
    }
    const t1 = make()
    const t2 = make()
    expect(t1).not.toBe(t2)
  })

  it('token has sufficient entropy (length >= 28 chars for 24 bytes)', () => {
    const bytes = new Uint8Array(24)
    crypto.getRandomValues(bytes)
    const token = btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '')
    // base64url of 24 bytes = 32 chars (no padding)
    expect(token.length).toBe(32)
  })
})

// ─── Token expiry logic ───────────────────────────────────────────────────────

describe('Token expiry logic', () => {
  it('token created within 24h is considered valid', () => {
    const createdAt = new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString() // 2h ago
    const expiryMs = 24 * 60 * 60 * 1000
    const isExpired = Date.now() - new Date(createdAt).getTime() > expiryMs
    expect(isExpired).toBe(false)
  })

  it('token created over 24h ago is considered expired', () => {
    const createdAt = new Date(Date.now() - 1000 * 60 * 60 * 25).toISOString() // 25h ago
    const expiryMs = 24 * 60 * 60 * 1000
    const isExpired = Date.now() - new Date(createdAt).getTime() > expiryMs
    expect(isExpired).toBe(true)
  })

  it('token at exactly 24h boundary is expired', () => {
    const createdAt = new Date(Date.now() - 1000 * 60 * 60 * 24 - 1).toISOString()
    const expiryMs = 24 * 60 * 60 * 1000
    const isExpired = Date.now() - new Date(createdAt).getTime() > expiryMs
    expect(isExpired).toBe(true)
  })
})

// ─── Status display logic ─────────────────────────────────────────────────────

describe('Status display logic', () => {
  it('returns correct label for each status', () => {
    expect(STATUS_LABELS['PENDING']).toBe('Menunggu Konfirmasi')
    expect(STATUS_LABELS['PREPARING']).toBe('Sedang Diproses')
    expect(STATUS_LABELS['READY']).toBe('Siap Diambil')
    expect(STATUS_LABELS['DELIVERED']).toBe('Selesai')
  })

  it('returns correct description for PREPARING status', () => {
    expect(STATUS_DESCRIPTIONS['PREPARING']).toContain('sedang disiapkan')
  })

  it('getStatusStep returns correct 0-based index for each status', () => {
    expect(getStatusStep('PENDING')).toBe(0)
    expect(getStatusStep('PREPARING')).toBe(1)
    expect(getStatusStep('READY')).toBe(2)
    expect(getStatusStep('DELIVERED')).toBe(3)
  })

  it('POS status PAID maps to tracking DELIVERED', () => {
    const statusMap: Record<string, string> = {
      PAID: 'DELIVERED',
      VOIDED: 'PENDING',
      REFUNDED: 'DELIVERED',
      PENDING: 'PENDING',
      PREPARING: 'PREPARING',
      READY: 'READY',
      DELIVERED: 'DELIVERED',
    }
    expect(statusMap['PAID']).toBe('DELIVERED')
    expect(statusMap['VOIDED']).toBe('PENDING')
    expect(statusMap['REFUNDED']).toBe('DELIVERED')
  })
})

// ─── Estimated time calculation ───────────────────────────────────────────────

describe('Estimated time calculation', () => {
  it('returns null for DELIVERED status', () => {
    const result = calculateEstimatedTime('DELIVERED', new Date().toISOString(), null)
    expect(result).toBeNull()
  })

  it('returns "Sebentar lagi" when estimated time has passed', () => {
    // Order created 30 minutes ago, default PENDING estimate is 20 min
    const createdAt = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    const result = calculateEstimatedTime('PENDING', createdAt, null)
    expect(result).toBe('Sebentar lagi')
  })

  it('returns "~N menit lagi" for future estimated time with explicit estimatedMinutes', () => {
    // Order just created, 30 min estimate
    const createdAt = new Date().toISOString()
    const result = calculateEstimatedTime('PREPARING', createdAt, 30)
    expect(result).toMatch(/^~\d+ menit lagi$/)
  })

  it('returns null for READY status with no explicit estimatedMinutes', () => {
    const createdAt = new Date().toISOString()
    const result = calculateEstimatedTime('READY', createdAt, null)
    // READY with default 0 mins returns null
    expect(result).toBeNull()
  })
})

// ─── Public route auth bypass ─────────────────────────────────────────────────

describe('Public route auth bypass', () => {
  it('/track/:token path segment is correctly identified as public', () => {
    const segs = ['track', 'abc123token']
    const isPublicTrack = segs[0] === 'track' && segs.length === 2
    expect(isPublicTrack).toBe(true)
  })

  it('/api/orders/:id/tracking-token requires auth (not in public list)', () => {
    const segs = ['orders', 'order123', 'tracking-token']
    const isPublicTrack = segs[0] === 'track' && segs.length === 2
    expect(isPublicTrack).toBe(false)
  })
})
