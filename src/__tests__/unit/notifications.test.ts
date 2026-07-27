import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  formatTimeAgo,
  loadNotifications,
  saveNotifications,
  countUnread,
  markAllRead,
  buildLowStockNotification,
  addNotificationIfNew,
  type AppNotification,
  type NotificationType,
} from '@/components/ui/NotificationCenter'

// ── helpers ────────────────────────────────────────────────────────────────

function makeNotif(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: 'test-1',
    type: 'SYSTEM',
    title: 'Test',
    message: 'Test message',
    createdAt: new Date().toISOString(),
    read: false,
    ...overrides,
  }
}

// ── Test 1: Notification type validation ──────────────────────────────────

describe('Notification type validation', () => {
  it('accepts all valid notification types', () => {
    const validTypes: NotificationType[] = ['LOW_STOCK', 'NEW_ORDER', 'SHIFT_REMINDER', 'SYSTEM']
    for (const type of validTypes) {
      const n = makeNotif({ type })
      expect(n.type).toBe(type)
    }
  })
})

// ── Test 2: LOW_STOCK type ─────────────────────────────────────────────────

describe('LOW_STOCK notification', () => {
  it('buildLowStockNotification returns correct type and message', () => {
    const n = buildLowStockNotification('Kopi Arabika', 3)
    expect(n.type).toBe('LOW_STOCK')
    expect(n.title).toBe('Stok Menipis')
    expect(n.message).toContain('Kopi Arabika')
    expect(n.message).toContain('3')
    expect(n.read).toBe(false)
  })
})

// ── Test 3: Unread count — all unread ─────────────────────────────────────

describe('countUnread', () => {
  it('counts all unread notifications', () => {
    const notifs: AppNotification[] = [
      makeNotif({ id: '1', read: false }),
      makeNotif({ id: '2', read: false }),
      makeNotif({ id: '3', read: false }),
    ]
    expect(countUnread(notifs)).toBe(3)
  })
})

// ── Test 4: Unread count — mixed ─────────────────────────────────────────

describe('countUnread mixed', () => {
  it('counts only unread when some are read', () => {
    const notifs: AppNotification[] = [
      makeNotif({ id: '1', read: true }),
      makeNotif({ id: '2', read: false }),
      makeNotif({ id: '3', read: true }),
      makeNotif({ id: '4', read: false }),
    ]
    expect(countUnread(notifs)).toBe(2)
  })
})

// ── Test 5: Unread count — all read ──────────────────────────────────────

describe('countUnread all read', () => {
  it('returns 0 when all notifications are read', () => {
    const notifs: AppNotification[] = [
      makeNotif({ id: '1', read: true }),
      makeNotif({ id: '2', read: true }),
    ]
    expect(countUnread(notifs)).toBe(0)
  })
})

// ── Test 6: Time ago formatting ───────────────────────────────────────────

describe('formatTimeAgo', () => {
  it('returns "Baru saja" for very recent timestamps', () => {
    const recent = new Date(Date.now() - 10_000).toISOString() // 10s ago
    expect(formatTimeAgo(recent)).toBe('Baru saja')
  })

  it('formats minutes correctly', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString()
    expect(formatTimeAgo(fiveMinAgo)).toContain('menit')
  })

  it('formats hours correctly', () => {
    const twoHrsAgo = new Date(Date.now() - 2 * 60 * 60_000).toISOString()
    expect(formatTimeAgo(twoHrsAgo)).toContain('jam')
  })

  it('formats days correctly', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60_000).toISOString()
    expect(formatTimeAgo(threeDaysAgo)).toContain('hari')
  })
})

// ── Test 7: Low stock trigger — adds new notification ────────────────────

describe('addNotificationIfNew', () => {
  it('adds a notification when id is not already present', () => {
    const existing: AppNotification[] = []
    const newNotif = buildLowStockNotification('Teh Hijau', 2)
    const result = addNotificationIfNew(existing, newNotif)
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('LOW_STOCK')
  })
})

// ── Test 8: Low stock trigger — no duplicate ─────────────────────────────

describe('addNotificationIfNew dedup', () => {
  it('does not add duplicate notification with same id', () => {
    const base = buildLowStockNotification('Teh Hijau', 2)
    const existing: AppNotification[] = [base]
    const result = addNotificationIfNew(existing, base)
    expect(result).toHaveLength(1)
  })
})

// ── Test 9: Mark all read ─────────────────────────────────────────────────

describe('markAllRead', () => {
  it('marks every notification as read', () => {
    const notifs: AppNotification[] = [
      makeNotif({ id: '1', read: false }),
      makeNotif({ id: '2', read: false }),
      makeNotif({ id: '3', read: true }),
    ]
    const result = markAllRead(notifs)
    expect(result.every(n => n.read)).toBe(true)
    // originals untouched (immutable)
    expect(notifs[0].read).toBe(false)
  })
})

// ── Test 10: localStorage round-trip ─────────────────────────────────────

describe('localStorage persistence', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('saves and loads notifications from localStorage', () => {
    const notifs: AppNotification[] = [
      makeNotif({
        id: 'a',
        type: 'NEW_ORDER',
        title: 'Order',
        message: 'Pesanan baru',
        read: false,
      }),
      makeNotif({
        id: 'b',
        type: 'SHIFT_REMINDER',
        title: 'Shift',
        message: 'Jangan lupa tutup shift',
        read: true,
      }),
    ]
    saveNotifications(notifs)
    const loaded = loadNotifications()
    expect(loaded).toHaveLength(2)
    expect(loaded[0].id).toBe('a')
    expect(loaded[1].read).toBe(true)
  })
})
