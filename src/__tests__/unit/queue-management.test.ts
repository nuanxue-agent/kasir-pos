import { describe, it, expect } from 'vitest'

// ── Types ─────────────────────────────────────────────────────────────────────

type QueueStatus = 'WAITING' | 'CALLED' | 'SERVING' | 'COMPLETED' | 'CANCELLED'
type QueuePriority = 'NORMAL' | 'HIGH'

interface QueueToken {
  id: string
  storeId: string
  tokenNumber: number
  customerName: string | null
  customerPhone: string | null
  serviceType: string
  status: QueueStatus
  priority: QueuePriority
  joinedAt: string
  calledAt: string | null
  completedAt: string | null
}

// ── Business Logic ─────────────────────────────────────────────────────────────

function generateTokenNumber(existingTokens: QueueToken[], date: string): number {
  const todayTokens = existingTokens.filter(t => t.joinedAt.startsWith(date))
  if (todayTokens.length === 0) return 1
  return Math.max(...todayTokens.map(t => t.tokenNumber)) + 1
}

function getQueuePosition(tokens: QueueToken[], tokenId: string): number {
  const waiting = tokens
    .filter(t => t.status === 'WAITING')
    .sort((a, b) => {
      if (a.priority === 'HIGH' && b.priority !== 'HIGH') return -1
      if (b.priority === 'HIGH' && a.priority !== 'HIGH') return 1
      return a.tokenNumber - b.tokenNumber
    })
  const idx = waiting.findIndex(t => t.id === tokenId)
  return idx === -1 ? -1 : idx + 1
}

function estimateWaitMinutes(
  waitingAhead: number,
  activeWindows: number,
  avgServiceMinutes: number,
): number {
  if (waitingAhead <= 0) return 0
  const windows = Math.max(activeWindows, 1)
  return Math.round((waitingAhead / windows) * avgServiceMinutes)
}

const ALLOWED_TRANSITIONS: Record<QueueStatus, QueueStatus[]> = {
  WAITING:   ['CALLED', 'CANCELLED'],
  CALLED:    ['SERVING', 'WAITING', 'CANCELLED'],
  SERVING:   ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
}

function isValidTransition(from: QueueStatus, to: QueueStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false
}

function sortByPriority(tokens: QueueToken[]): QueueToken[] {
  return [...tokens].sort((a, b) => {
    if (a.priority === 'HIGH' && b.priority !== 'HIGH') return -1
    if (b.priority === 'HIGH' && a.priority !== 'HIGH') return 1
    return a.tokenNumber - b.tokenNumber
  })
}

function getNextToken(tokens: QueueToken[], serviceType?: string): QueueToken | null {
  let waiting = tokens.filter(t => t.status === 'WAITING')
  if (serviceType) waiting = waiting.filter(t => t.serviceType === serviceType)
  const sorted = sortByPriority(waiting)
  return sorted[0] ?? null
}

function calcAvgServiceMinutes(tokens: QueueToken[]): number {
  const completed = tokens.filter(
    t => t.status === 'COMPLETED' && t.calledAt !== null && t.completedAt !== null,
  )
  if (completed.length === 0) return 10 // default fallback
  const totalMs = completed.reduce((acc, t) => {
    return acc + (new Date(t.completedAt!).getTime() - new Date(t.calledAt!).getTime())
  }, 0)
  return Math.round(totalMs / completed.length / 60000)
}

// ── Fixtures ───────────────────────────────────────────────────────────────────

function makeToken(overrides: Partial<QueueToken> = {}): QueueToken {
  return {
    id: 'tok-1',
    storeId: 'store-1',
    tokenNumber: 1,
    customerName: 'Budi',
    customerPhone: null,
    serviceType: 'GENERAL',
    status: 'WAITING',
    priority: 'NORMAL',
    joinedAt: '2026-07-28T08:00:00.000Z',
    calledAt: null,
    completedAt: null,
    ...overrides,
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('Queue Management', () => {

  // 1. Token number generation — first token of the day
  it('generates token number 1 when no tokens exist today', () => {
    const result = generateTokenNumber([], '2026-07-28')
    expect(result).toBe(1)
  })

  // 2. Token number generation — increments from max
  it('generates next token number sequentially', () => {
    const tokens: QueueToken[] = [
      makeToken({ id: 'a', tokenNumber: 1, joinedAt: '2026-07-28T08:00:00.000Z' }),
      makeToken({ id: 'b', tokenNumber: 2, joinedAt: '2026-07-28T08:05:00.000Z' }),
      makeToken({ id: 'c', tokenNumber: 3, joinedAt: '2026-07-28T08:10:00.000Z' }),
    ]
    expect(generateTokenNumber(tokens, '2026-07-28')).toBe(4)
  })

  // 3. Token number generation — resets for a new day
  it('generates token number 1 for a new day even if previous days have tokens', () => {
    const tokens: QueueToken[] = [
      makeToken({ id: 'a', tokenNumber: 42, joinedAt: '2026-07-27T08:00:00.000Z' }),
    ]
    expect(generateTokenNumber(tokens, '2026-07-28')).toBe(1)
  })

  // 4. Queue position — correct position in FIFO list
  it('returns correct queue position (1-indexed)', () => {
    const tokens: QueueToken[] = [
      makeToken({ id: 'a', tokenNumber: 1 }),
      makeToken({ id: 'b', tokenNumber: 2 }),
      makeToken({ id: 'c', tokenNumber: 3 }),
    ]
    expect(getQueuePosition(tokens, 'b')).toBe(2)
  })

  // 5. Queue position — returns -1 for unknown token
  it('returns -1 for a token not in the waiting list', () => {
    const tokens: QueueToken[] = [makeToken({ id: 'a', tokenNumber: 1 })]
    expect(getQueuePosition(tokens, 'nonexistent')).toBe(-1)
  })

  // 6. Wait time estimation — basic calculation
  it('estimates wait time correctly based on avg service time', () => {
    // 4 people waiting, 2 windows serving, avg 10 min → 4/2 * 10 = 20 min
    expect(estimateWaitMinutes(4, 2, 10)).toBe(20)
  })

  // 7. Wait time estimation — returns 0 when nobody ahead
  it('returns 0 estimated wait when no one is waiting ahead', () => {
    expect(estimateWaitMinutes(0, 1, 10)).toBe(0)
  })

  // 8. Wait time estimation — defaults to at least 1 window
  it('handles 0 active windows gracefully (treats as 1)', () => {
    // 3 waiting, 0 active → use 1 window → 3 * 10 = 30
    expect(estimateWaitMinutes(3, 0, 10)).toBe(30)
  })

  // 9. Priority queue ordering — HIGH before NORMAL
  it('places HIGH priority tokens before NORMAL in the sorted queue', () => {
    const tokens: QueueToken[] = [
      makeToken({ id: 'a', tokenNumber: 1, priority: 'NORMAL' }),
      makeToken({ id: 'b', tokenNumber: 2, priority: 'HIGH' }),
      makeToken({ id: 'c', tokenNumber: 3, priority: 'NORMAL' }),
    ]
    const sorted = sortByPriority(tokens)
    expect(sorted[0].id).toBe('b')
  })

  // 10. Priority queue ordering — HIGH tokens keep relative order among themselves
  it('sorts HIGH tokens by tokenNumber when multiple HIGH tokens exist', () => {
    const tokens: QueueToken[] = [
      makeToken({ id: 'a', tokenNumber: 5, priority: 'HIGH' }),
      makeToken({ id: 'b', tokenNumber: 2, priority: 'HIGH' }),
    ]
    const sorted = sortByPriority(tokens)
    expect(sorted[0].id).toBe('b')
    expect(sorted[1].id).toBe('a')
  })

  // 11. Status transition validation — valid transitions allowed
  it('allows valid status transitions', () => {
    expect(isValidTransition('WAITING', 'CALLED')).toBe(true)
    expect(isValidTransition('CALLED', 'SERVING')).toBe(true)
    expect(isValidTransition('SERVING', 'COMPLETED')).toBe(true)
    expect(isValidTransition('WAITING', 'CANCELLED')).toBe(true)
  })

  // 12. Status transition validation — invalid transitions blocked
  it('blocks invalid status transitions', () => {
    expect(isValidTransition('COMPLETED', 'WAITING')).toBe(false)
    expect(isValidTransition('CANCELLED', 'SERVING')).toBe(false)
    expect(isValidTransition('WAITING', 'COMPLETED')).toBe(false)
    expect(isValidTransition('COMPLETED', 'CANCELLED')).toBe(false)
  })

  // Bonus: avg service time calculation
  it('calculates average service time from completed tokens', () => {
    const tokens: QueueToken[] = [
      makeToken({
        id: 'a', status: 'COMPLETED',
        calledAt:    '2026-07-28T09:00:00.000Z',
        completedAt: '2026-07-28T09:10:00.000Z', // 10 min
      }),
      makeToken({
        id: 'b', status: 'COMPLETED',
        calledAt:    '2026-07-28T09:10:00.000Z',
        completedAt: '2026-07-28T09:30:00.000Z', // 20 min
      }),
    ]
    // avg = (10 + 20) / 2 = 15 min
    expect(calcAvgServiceMinutes(tokens)).toBe(15)
  })

  // Bonus: getNextToken respects serviceType filter
  it('picks the next token for a specific service type', () => {
    const tokens: QueueToken[] = [
      makeToken({ id: 'a', tokenNumber: 1, serviceType: 'KASIR' }),
      makeToken({ id: 'b', tokenNumber: 2, serviceType: 'GENERAL' }),
      makeToken({ id: 'c', tokenNumber: 3, serviceType: 'KASIR' }),
    ]
    const next = getNextToken(tokens, 'KASIR')
    expect(next?.id).toBe('a')
  })
})
