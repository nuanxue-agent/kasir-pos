import { describe, it, expect } from 'vitest'

// ── Types ──────────────────────────────────────────────────────────────────────

type Channel   = 'WHATSAPP' | 'SMS' | 'EMAIL' | 'INAPP'
type Direction = 'INBOUND' | 'OUTBOUND'
type CommStatus = 'SENT' | 'DELIVERED' | 'READ' | 'FAILED'

interface CommunicationLog {
  id: string
  storeId: string
  customerId: string
  channel: Channel
  direction: Direction
  subject: string | null
  body: string
  status: CommStatus
  sentAt: string
  metadata: Record<string, unknown> | null
}

// ── Pure business logic ────────────────────────────────────────────────────────

const VALID_CHANNELS: Channel[]   = ['WHATSAPP', 'SMS', 'EMAIL', 'INAPP']
const VALID_DIRECTIONS: Direction[] = ['INBOUND', 'OUTBOUND']

const STATUS_TRANSITIONS: Record<CommStatus, CommStatus[]> = {
  SENT:      ['DELIVERED', 'FAILED'],
  DELIVERED: ['READ', 'FAILED'],
  READ:      [],
  FAILED:    [],
}

function isValidChannel(ch: string): ch is Channel {
  return (VALID_CHANNELS as string[]).includes(ch)
}

function isValidDirection(d: string): d is Direction {
  return (VALID_DIRECTIONS as string[]).includes(d)
}

function canTransition(from: CommStatus, to: CommStatus): boolean {
  return STATUS_TRANSITIONS[from].includes(to)
}

function createLogEntry(
  overrides: Partial<CommunicationLog> & Pick<CommunicationLog, 'storeId' | 'customerId' | 'channel' | 'direction' | 'body'>,
): CommunicationLog {
  return {
    id:       overrides.id       ?? `comm_${Date.now()}`,
    subject:  overrides.subject  ?? null,
    status:   overrides.status   ?? 'SENT',
    sentAt:   overrides.sentAt   ?? new Date().toISOString(),
    metadata: overrides.metadata ?? null,
    ...overrides,
  }
}

function filterByChannel(logs: CommunicationLog[], channel: Channel): CommunicationLog[] {
  return logs.filter(l => l.channel === channel)
}

function filterByDirection(logs: CommunicationLog[], direction: Direction): CommunicationLog[] {
  return logs.filter(l => l.direction === direction)
}

function sortChronological(logs: CommunicationLog[]): CommunicationLog[] {
  return [...logs].sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime())
}

function customerTimeline(logs: CommunicationLog[], customerId: string): CommunicationLog[] {
  return sortChronological(logs.filter(l => l.customerId === customerId))
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('CommunicationLog — entry creation', () => {
  it('creates a log entry with required fields', () => {
    const log = createLogEntry({
      storeId: 'store1', customerId: 'cust1',
      channel: 'EMAIL', direction: 'OUTBOUND', body: 'Hello!',
    })
    expect(log.storeId).toBe('store1')
    expect(log.customerId).toBe('cust1')
    expect(log.channel).toBe('EMAIL')
    expect(log.direction).toBe('OUTBOUND')
    expect(log.body).toBe('Hello!')
    expect(log.status).toBe('SENT')
    expect(log.id).toBeTruthy()
    expect(log.sentAt).toBeTruthy()
  })

  it('defaults status to SENT when not provided', () => {
    const log = createLogEntry({
      storeId: 'store1', customerId: 'cust1',
      channel: 'SMS', direction: 'OUTBOUND', body: 'hi',
    })
    expect(log.status).toBe('SENT')
  })

  it('stores metadata as a JSON-compatible object', () => {
    const meta = { orderId: 'ord_123', campaign: 'promo' }
    const log = createLogEntry({
      storeId: 'store1', customerId: 'cust1',
      channel: 'WHATSAPP', direction: 'OUTBOUND', body: 'promo msg',
      metadata: meta,
    })
    expect(log.metadata).toEqual(meta)
  })
})

describe('CommunicationLog — channel validation', () => {
  it('accepts all valid channels', () => {
    for (const ch of VALID_CHANNELS) {
      expect(isValidChannel(ch)).toBe(true)
    }
  })

  it('rejects invalid channel values', () => {
    expect(isValidChannel('TELEGRAM')).toBe(false)
    expect(isValidChannel('PUSH')).toBe(false)
    expect(isValidChannel('')).toBe(false)
  })

  it('accepts both valid directions', () => {
    expect(isValidDirection('INBOUND')).toBe(true)
    expect(isValidDirection('OUTBOUND')).toBe(true)
  })

  it('rejects invalid direction values', () => {
    expect(isValidDirection('INTERNAL')).toBe(false)
    expect(isValidDirection('')).toBe(false)
  })
})

describe('CommunicationLog — direction filtering', () => {
  const logs: CommunicationLog[] = [
    createLogEntry({ id: '1', storeId: 's', customerId: 'c1', channel: 'EMAIL',    direction: 'OUTBOUND', body: 'out1' }),
    createLogEntry({ id: '2', storeId: 's', customerId: 'c1', channel: 'SMS',      direction: 'INBOUND',  body: 'in1'  }),
    createLogEntry({ id: '3', storeId: 's', customerId: 'c2', channel: 'WHATSAPP', direction: 'OUTBOUND', body: 'out2' }),
    createLogEntry({ id: '4', storeId: 's', customerId: 'c2', channel: 'INAPP',    direction: 'INBOUND',  body: 'in2'  }),
  ]

  it('filters to only INBOUND messages', () => {
    const inbound = filterByDirection(logs, 'INBOUND')
    expect(inbound).toHaveLength(2)
    expect(inbound.every(l => l.direction === 'INBOUND')).toBe(true)
  })

  it('filters to only OUTBOUND messages', () => {
    const outbound = filterByDirection(logs, 'OUTBOUND')
    expect(outbound).toHaveLength(2)
    expect(outbound.every(l => l.direction === 'OUTBOUND')).toBe(true)
  })

  it('filters by channel correctly', () => {
    const emails = filterByChannel(logs, 'EMAIL')
    expect(emails).toHaveLength(1)
    expect(emails[0].channel).toBe('EMAIL')
  })
})

describe('CommunicationLog — status transitions', () => {
  it('allows SENT → DELIVERED', () => {
    expect(canTransition('SENT', 'DELIVERED')).toBe(true)
  })

  it('allows DELIVERED → READ', () => {
    expect(canTransition('DELIVERED', 'READ')).toBe(true)
  })

  it('allows SENT → FAILED and DELIVERED → FAILED', () => {
    expect(canTransition('SENT', 'FAILED')).toBe(true)
    expect(canTransition('DELIVERED', 'FAILED')).toBe(true)
  })

  it('disallows READ → anything (terminal state)', () => {
    expect(canTransition('READ', 'SENT')).toBe(false)
    expect(canTransition('READ', 'DELIVERED')).toBe(false)
    expect(canTransition('READ', 'FAILED')).toBe(false)
  })

  it('disallows FAILED → anything (terminal state)', () => {
    expect(canTransition('FAILED', 'SENT')).toBe(false)
    expect(canTransition('FAILED', 'DELIVERED')).toBe(false)
    expect(canTransition('FAILED', 'READ')).toBe(false)
  })

  it('disallows skipping DELIVERED (SENT → READ is invalid)', () => {
    expect(canTransition('SENT', 'READ')).toBe(false)
  })
})

describe('CommunicationLog — timeline chronological sort', () => {
  const logs: CommunicationLog[] = [
    createLogEntry({ id: 'c', storeId: 's', customerId: 'cust1', channel: 'EMAIL',    direction: 'OUTBOUND', body: 'third',  sentAt: '2024-03-01T12:00:00Z' }),
    createLogEntry({ id: 'a', storeId: 's', customerId: 'cust1', channel: 'SMS',      direction: 'INBOUND',  body: 'first',  sentAt: '2024-01-01T08:00:00Z' }),
    createLogEntry({ id: 'b', storeId: 's', customerId: 'cust1', channel: 'WHATSAPP', direction: 'OUTBOUND', body: 'second', sentAt: '2024-02-15T09:30:00Z' }),
    createLogEntry({ id: 'd', storeId: 's', customerId: 'cust2', channel: 'INAPP',    direction: 'INBOUND',  body: 'other',  sentAt: '2024-01-10T10:00:00Z' }),
  ]

  it('sorts timeline chronologically (oldest first)', () => {
    const sorted = sortChronological(logs)
    // All 4 entries sorted by sentAt ascending
    expect(sorted[0].id).toBe('a') // Jan 1
    expect(sorted[1].id).toBe('d') // Jan 10
    expect(sorted[2].id).toBe('b') // Feb 15
    expect(sorted[3].id).toBe('c') // Mar 1
  })

  it('customer timeline includes only that customer\'s messages', () => {
    const timeline = customerTimeline(logs, 'cust1')
    expect(timeline).toHaveLength(3)
    expect(timeline.every(l => l.customerId === 'cust1')).toBe(true)
  })

  it('customer timeline is ordered oldest to newest', () => {
    const timeline = customerTimeline(logs, 'cust1')
    for (let i = 1; i < timeline.length; i++) {
      const prev = new Date(timeline[i - 1].sentAt).getTime()
      const curr = new Date(timeline[i].sentAt).getTime()
      expect(prev).toBeLessThanOrEqual(curr)
    }
  })
})
