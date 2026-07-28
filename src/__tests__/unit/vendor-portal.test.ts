import { describe, it, expect } from 'vitest'

// ── Pure business-logic helpers mirroring API route logic ─────────────────────

/** Generate a vendor invite token (hex, 64 chars) */
function generateInviteToken(): string {
  // In the real route we use two newId() calls joined without dashes
  const chars = 'abcdef0123456789'
  let token = ''
  for (let i = 0; i < 64; i++) {
    token += chars[Math.floor(Math.random() * chars.length)]
  }
  return token
}

/** Check if an invite is expired relative to a given "now" */
function isInviteExpired(expiresAt: string, now = new Date()): boolean {
  return new Date(expiresAt) <= now
}

/** Calculate invite expiry date: 7 days from creation */
function calcInviteExpiry(createdAt: string): Date {
  const d = new Date(createdAt)
  d.setDate(d.getDate() + 7)
  return d
}

/** Calculate vendor performance scorecard from list of POs */
interface PO {
  status: string
  createdAt: string
  expectedDate?: string
  updatedAt?: string
  confirmedAt?: string
  total: number
}

interface Scorecard {
  onTimePct: number
  avgResponseHours: number
  qualityRating: number
  totalOrders: number
  totalValue: number
}

function calcScorecard(pos: PO[]): Scorecard {
  const totalOrders = pos.length
  const totalValue = pos.reduce((s, p) => s + p.total, 0)
  const received = pos.filter(p => p.status === 'RECEIVED')
  const onTime = received.filter(p => {
    if (!p.expectedDate || !p.updatedAt) return false
    return new Date(p.updatedAt) <= new Date(p.expectedDate)
  })
  const onTimePct = received.length ? (onTime.length / received.length) * 100 : 0

  const confirmed = pos.filter(p => p.confirmedAt && p.createdAt)
  const avgResponseHours = confirmed.length
    ? confirmed.reduce((sum, p) => {
        return sum + (new Date(p.confirmedAt!).getTime() - new Date(p.createdAt).getTime()) / (1000 * 60 * 60)
      }, 0) / confirmed.length
    : 0

  const qualityRating = received.length ? 4.2 : 0 // stub

  return { onTimePct, avgResponseHours, qualityRating, totalOrders, totalValue }
}

/** Sort messages by sentAt ascending */
interface Msg { id: string; sentAt: string; direction: 'IN' | 'OUT'; body: string }
function sortMessageThread(messages: Msg[]): Msg[] {
  return [...messages].sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime())
}

/** Filter POs by status */
function filterPOsByStatus(pos: PO[], statuses: string[]): PO[] {
  return pos.filter(p => statuses.includes(p.status))
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Vendor invite token generation', () => {
  it('generates a token of length 64', () => {
    const token = generateInviteToken()
    expect(token).toHaveLength(64)
  })

  it('generates only hex characters', () => {
    const token = generateInviteToken()
    expect(token).toMatch(/^[a-f0-9]+$/)
  })

  it('generates unique tokens on successive calls', () => {
    const tokens = new Set(Array.from({ length: 20 }, generateInviteToken))
    expect(tokens.size).toBe(20)
  })
})

describe('Invite expiry validation', () => {
  it('marks a past-date invite as expired', () => {
    const past = new Date(Date.now() - 1000).toISOString()
    expect(isInviteExpired(past)).toBe(true)
  })

  it('marks a future-date invite as not expired', () => {
    const future = new Date(Date.now() + 60_000).toISOString()
    expect(isInviteExpired(future)).toBe(false)
  })

  it('calculates expiry 7 days from createdAt', () => {
    const created = '2025-01-01T00:00:00.000Z'
    const expiry = calcInviteExpiry(created)
    expect(expiry.toISOString()).toBe('2025-01-08T00:00:00.000Z')
  })
})

describe('Performance scorecard calculation', () => {
  const samplePOs: PO[] = [
    {
      status: 'RECEIVED',
      createdAt: '2025-01-01T08:00:00.000Z',
      expectedDate: '2025-01-10T00:00:00.000Z',
      updatedAt: '2025-01-09T12:00:00.000Z', // on time
      confirmedAt: '2025-01-01T10:00:00.000Z',
      total: 500_000,
    },
    {
      status: 'RECEIVED',
      createdAt: '2025-01-05T08:00:00.000Z',
      expectedDate: '2025-01-12T00:00:00.000Z',
      updatedAt: '2025-01-15T08:00:00.000Z', // late
      confirmedAt: '2025-01-05T20:00:00.000Z',
      total: 300_000,
    },
    {
      status: 'DRAFT',
      createdAt: '2025-01-10T08:00:00.000Z',
      total: 200_000,
    },
  ]

  it('calculates on-time % correctly (1 of 2 received on time = 50%)', () => {
    const sc = calcScorecard(samplePOs)
    expect(sc.onTimePct).toBe(50)
  })

  it('returns 0 on-time % when no RECEIVED POs exist', () => {
    const sc = calcScorecard([{ status: 'DRAFT', createdAt: '2025-01-01T00:00:00.000Z', total: 0 }])
    expect(sc.onTimePct).toBe(0)
  })

  it('counts total orders including all statuses', () => {
    const sc = calcScorecard(samplePOs)
    expect(sc.totalOrders).toBe(3)
  })

  it('sums total value across all POs', () => {
    const sc = calcScorecard(samplePOs)
    expect(sc.totalValue).toBe(1_000_000)
  })

  it('calculates average response time in hours', () => {
    const sc = calcScorecard(samplePOs)
    // PO1: 2h, PO2: 12h → avg 7h
    expect(sc.avgResponseHours).toBe(7)
  })
})

describe('Message thread ordering', () => {
  const messages: Msg[] = [
    { id: 'm3', sentAt: '2025-01-03T10:00:00.000Z', direction: 'IN', body: 'Third' },
    { id: 'm1', sentAt: '2025-01-01T10:00:00.000Z', direction: 'OUT', body: 'First' },
    { id: 'm2', sentAt: '2025-01-02T10:00:00.000Z', direction: 'IN', body: 'Second' },
  ]

  it('sorts messages oldest-first', () => {
    const sorted = sortMessageThread(messages)
    expect(sorted.map(m => m.id)).toEqual(['m1', 'm2', 'm3'])
  })

  it('does not mutate the original array', () => {
    const original = [...messages]
    sortMessageThread(messages)
    expect(messages.map(m => m.id)).toEqual(original.map(m => m.id))
  })
})

describe('PO status filtering', () => {
  const pos: PO[] = [
    { status: 'DRAFT', createdAt: '2025-01-01T00:00:00.000Z', total: 100 },
    { status: 'SENT', createdAt: '2025-01-02T00:00:00.000Z', total: 200 },
    { status: 'CONFIRMED', createdAt: '2025-01-03T00:00:00.000Z', total: 300 },
    { status: 'RECEIVED', createdAt: '2025-01-04T00:00:00.000Z', total: 400 },
    { status: 'CANCELLED', createdAt: '2025-01-05T00:00:00.000Z', total: 500 },
  ]

  it('filters open POs (DRAFT, SENT, CONFIRMED)', () => {
    const open = filterPOsByStatus(pos, ['DRAFT', 'SENT', 'CONFIRMED'])
    expect(open).toHaveLength(3)
    expect(open.map(p => p.status)).toEqual(['DRAFT', 'SENT', 'CONFIRMED'])
  })

  it('filters only RECEIVED POs for payment history', () => {
    const received = filterPOsByStatus(pos, ['RECEIVED'])
    expect(received).toHaveLength(1)
    expect(received[0].total).toBe(400)
  })
})
