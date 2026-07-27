import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  formatTimeAgo,
  getEventIcon,
  getEventIconBg,
  getEventDescription,
  deduplicateEvents,
  type ActivityEvent,
} from '@/components/dashboard/ActivityFeedClient'

// ─── formatTimeAgo ─────────────────────────────────────────────────────────────

describe('formatTimeAgo', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns "baru saja" for future dates or zero diff', () => {
    const future = new Date(Date.now() + 1000).toISOString()
    expect(formatTimeAgo(future)).toBe('baru saja')
  })

  it('formats seconds ago correctly', () => {
    const t = new Date(Date.now() - 45_000).toISOString()
    expect(formatTimeAgo(t)).toBe('45d lalu')
  })

  it('formats minutes ago correctly', () => {
    const t = new Date(Date.now() - 5 * 60_000).toISOString()
    expect(formatTimeAgo(t)).toBe('5m lalu')
  })

  it('formats hours ago correctly', () => {
    const t = new Date(Date.now() - 3 * 3600_000).toISOString()
    expect(formatTimeAgo(t)).toBe('3j lalu')
  })

  it('formats days ago correctly', () => {
    const t = new Date(Date.now() - 2 * 86_400_000).toISOString()
    expect(formatTimeAgo(t)).toBe('2h lalu')
  })
})

// ─── getEventIcon / getEventIconBg ─────────────────────────────────────────────

describe('getEventIcon', () => {
  it('returns non-null icon for ORDER_CREATE', () => {
    expect(getEventIcon('ORDER_CREATE')).not.toBeNull()
  })

  it('returns non-null icon for STOCK_ADJUST', () => {
    expect(getEventIcon('STOCK_ADJUST')).not.toBeNull()
  })

  it('returns non-null icon for CUSTOMER_CREATE', () => {
    expect(getEventIcon('CUSTOMER_CREATE')).not.toBeNull()
  })

  it('returns non-null icon for LOGIN', () => {
    expect(getEventIcon('LOGIN')).not.toBeNull()
  })

  it('returns non-null fallback icon for unknown action', () => {
    expect(getEventIcon('UNKNOWN_ACTION')).not.toBeNull()
  })
})

describe('getEventIconBg', () => {
  it('returns blue class for ORDER actions', () => {
    expect(getEventIconBg('ORDER_CREATE')).toContain('blue')
  })

  it('returns amber class for STOCK_ADJUST', () => {
    expect(getEventIconBg('STOCK_ADJUST')).toContain('amber')
  })

  it('returns emerald class for CUSTOMER_CREATE', () => {
    expect(getEventIconBg('CUSTOMER_CREATE')).toContain('emerald')
  })

  it('returns a fallback class for unknown actions', () => {
    const cls = getEventIconBg('TOTALLY_UNKNOWN')
    expect(cls).toBeTruthy()
    expect(typeof cls).toBe('string')
  })
})

// ─── getEventDescription ───────────────────────────────────────────────────────

describe('getEventDescription', () => {
  it('describes ORDER_CREATE with resource', () => {
    expect(getEventDescription('ORDER_CREATE', '#1234')).toContain('#1234')
  })

  it('describes SHIFT_OPEN without resource', () => {
    expect(getEventDescription('SHIFT_OPEN', null)).toBe('Shift dibuka')
  })

  it('handles unknown actions gracefully', () => {
    const desc = getEventDescription('CUSTOM_ACTION', null)
    expect(typeof desc).toBe('string')
    expect(desc.length).toBeGreaterThan(0)
  })
})

// ─── deduplicateEvents ─────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    id: Math.random().toString(36).slice(2),
    action: 'ORDER_CREATE',
    resource: null,
    userId: 'user-1',
    userName: 'Test User',
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('deduplicateEvents', () => {
  it('returns empty array for empty input', () => {
    expect(deduplicateEvents([])).toEqual([])
  })

  it('keeps a single event unchanged', () => {
    const ev = makeEvent()
    expect(deduplicateEvents([ev])).toHaveLength(1)
  })

  it('removes duplicate events within 5-second window for same user+action', () => {
    const base = Date.now()
    const ev1 = makeEvent({ id: 'a', createdAt: new Date(base).toISOString() })
    const ev2 = makeEvent({ id: 'b', createdAt: new Date(base + 2000).toISOString() })
    const result = deduplicateEvents([ev1, ev2])
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('a')
  })

  it('keeps events from different users with same action', () => {
    const base = Date.now()
    const ev1 = makeEvent({ id: 'a', userId: 'user-1', createdAt: new Date(base).toISOString() })
    const ev2 = makeEvent({ id: 'b', userId: 'user-2', createdAt: new Date(base + 1000).toISOString() })
    expect(deduplicateEvents([ev1, ev2])).toHaveLength(2)
  })

  it('keeps events from same user with different actions', () => {
    const base = Date.now()
    const ev1 = makeEvent({ id: 'a', action: 'ORDER_CREATE', createdAt: new Date(base).toISOString() })
    const ev2 = makeEvent({ id: 'b', action: 'STOCK_ADJUST', createdAt: new Date(base + 1000).toISOString() })
    expect(deduplicateEvents([ev1, ev2])).toHaveLength(2)
  })

  it('keeps events outside the 5-second window even for same user+action', () => {
    const base = Date.now()
    const ev1 = makeEvent({ id: 'a', createdAt: new Date(base).toISOString() })
    const ev2 = makeEvent({ id: 'b', createdAt: new Date(base + 6000).toISOString() })
    expect(deduplicateEvents([ev1, ev2])).toHaveLength(2)
  })
})
