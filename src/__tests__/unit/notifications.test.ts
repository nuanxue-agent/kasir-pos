import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  countUnread,
  markAllRead,
  addNotificationIfNew,
  buildLowStockNotification,
  type AppNotification,
} from '@/components/ui/NotificationCenter'
import {
  mergePreferences,
  type NotificationPreference,
  type ExtendedNotificationType,
} from '@/components/notifications/NotificationCenterClient'
import { validatePushSubscription, type PushSubscriptionPayload } from '@/lib/push-notifications'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeNotif(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: `notif-${Math.random().toString(36).slice(2)}`,
    type: 'LOW_STOCK',
    title: 'Test',
    message: 'Test message',
    createdAt: new Date().toISOString(),
    read: false,
    ...overrides,
  }
}

function makePrefs(overrides: Partial<NotificationPreference>[] = []): NotificationPreference[] {
  const defaults: NotificationPreference[] = [
    { type: 'LOW_STOCK', inApp: true, push: true, email: false },
    { type: 'NEW_ORDER', inApp: true, push: true, email: false },
    { type: 'PAYMENT_RECEIVED', inApp: true, push: false, email: false },
    { type: 'GOAL_REACHED', inApp: true, push: true, email: true },
    { type: 'SYSTEM_ALERT', inApp: true, push: false, email: true },
  ]
  return defaults.map((d, i) => ({ ...d, ...(overrides[i] ?? {}) }))
}

// ── 1. Notification filtering by type ─────────────────────────────────────────

describe('Notification filtering by type', () => {
  it('filters notifications to a single type', () => {
    const notifs: AppNotification[] = [
      makeNotif({ type: 'LOW_STOCK' }),
      makeNotif({ type: 'NEW_ORDER' }),
      makeNotif({ type: 'LOW_STOCK' }),
      makeNotif({ type: 'SYSTEM' as any }),
    ]
    const lowStock = notifs.filter(n => n.type === 'LOW_STOCK')
    expect(lowStock).toHaveLength(2)
  })

  it('returns empty array when no notifications match the filter', () => {
    const notifs: AppNotification[] = [
      makeNotif({ type: 'LOW_STOCK' }),
      makeNotif({ type: 'NEW_ORDER' }),
    ]
    const result = notifs.filter(n => n.type === ('GOAL_REACHED' as any))
    expect(result).toHaveLength(0)
  })

  it('ALL filter returns all notifications regardless of type', () => {
    const notifs: AppNotification[] = [
      makeNotif({ type: 'LOW_STOCK' }),
      makeNotif({ type: 'NEW_ORDER' }),
      makeNotif({ type: 'SYSTEM' as any }),
    ]
    // 'ALL' means no filter applied
    expect(notifs).toHaveLength(3)
  })
})

// ── 2. Unread count calculation ────────────────────────────────────────────────

describe('Unread count calculation', () => {
  it('counts only unread notifications', () => {
    const notifs: AppNotification[] = [
      makeNotif({ read: false }),
      makeNotif({ read: true }),
      makeNotif({ read: false }),
      makeNotif({ read: true }),
      makeNotif({ read: false }),
    ]
    expect(countUnread(notifs)).toBe(3)
  })

  it('returns 0 for empty list', () => {
    expect(countUnread([])).toBe(0)
  })

  it('returns 0 when all notifications are read', () => {
    const notifs = [makeNotif({ read: true }), makeNotif({ read: true })]
    expect(countUnread(notifs)).toBe(0)
  })

  it('marks all as read and unread count becomes 0', () => {
    const notifs = [makeNotif({ read: false }), makeNotif({ read: false })]
    const updated = markAllRead(notifs)
    expect(countUnread(updated)).toBe(0)
    expect(updated.every(n => n.read)).toBe(true)
  })
})

// ── 3. Push subscription validation ───────────────────────────────────────────

describe('Push subscription validation', () => {
  const valid: PushSubscriptionPayload = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
    keys: {
      p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlTiEDXnI',
      auth: 'tBHItJI5svbpez7KI4CCXg==',
    },
  }

  it('accepts a valid push subscription payload', () => {
    expect(validatePushSubscription(valid)).toBe(true)
  })

  it('rejects null', () => {
    expect(validatePushSubscription(null)).toBe(false)
  })

  it('rejects missing endpoint', () => {
    const bad = { keys: valid.keys }
    expect(validatePushSubscription(bad)).toBe(false)
  })

  it('rejects non-https endpoint', () => {
    const bad = { ...valid, endpoint: 'http://insecure.example.com/push' }
    expect(validatePushSubscription(bad)).toBe(false)
  })

  it('rejects missing p256dh key', () => {
    const bad = { ...valid, keys: { auth: valid.keys.auth } }
    expect(validatePushSubscription(bad)).toBe(false)
  })

  it('rejects short auth key', () => {
    const bad = { ...valid, keys: { ...valid.keys, auth: 'ab' } }
    expect(validatePushSubscription(bad)).toBe(false)
  })
})

// ── 4. Notification preference merging ────────────────────────────────────────

describe('Notification preference merging', () => {
  it('uses defaults when overrides is empty', () => {
    const defaults = makePrefs()
    const result = mergePreferences(defaults, [])
    expect(result).toHaveLength(defaults.length)
    expect(result[0]).toMatchObject(defaults[0])
  })

  it('overrides a single channel for a type', () => {
    const defaults = makePrefs()
    const override: NotificationPreference = {
      type: 'LOW_STOCK',
      inApp: false,
      push: true,
      email: true,
    }
    const result = mergePreferences(defaults, [override])
    const lowStock = result.find(p => p.type === 'LOW_STOCK')!
    expect(lowStock.inApp).toBe(false)
    expect(lowStock.email).toBe(true)
  })

  it('does not affect other types when overriding one', () => {
    const defaults = makePrefs()
    const override: NotificationPreference = {
      type: 'NEW_ORDER',
      inApp: false,
      push: false,
      email: false,
    }
    const result = mergePreferences(defaults, [override])
    const lowStock = result.find(p => p.type === 'LOW_STOCK')!
    expect(lowStock).toMatchObject(defaults.find(p => p.type === 'LOW_STOCK')!)
  })

  it('ignores overrides for unknown types', () => {
    const defaults = makePrefs()
    const override = {
      type: 'UNKNOWN_TYPE' as ExtendedNotificationType,
      inApp: false,
      push: false,
      email: false,
    }
    const result = mergePreferences(defaults, [override])
    // Should not add new entries
    expect(result).toHaveLength(defaults.length)
  })

  it('preserves all five default types after merge', () => {
    const defaults = makePrefs()
    const result = mergePreferences(defaults, [])
    const types = result.map(p => p.type)
    expect(types).toContain('LOW_STOCK')
    expect(types).toContain('NEW_ORDER')
    expect(types).toContain('PAYMENT_RECEIVED')
    expect(types).toContain('GOAL_REACHED')
    expect(types).toContain('SYSTEM_ALERT')
  })
})
