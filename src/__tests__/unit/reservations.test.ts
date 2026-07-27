import { describe, it, expect } from 'vitest'

// ─── Pure logic (mirrors what ReservationClient + API use) ───────────────────

type ReservationStatus = 'PENDING' | 'CONFIRMED' | 'SEATED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW'
type WaitStatus = 'WAITING' | 'SEATED' | 'CANCELLED'

interface Reservation {
  id: string
  tableId: string
  datetime: string // ISO
  durationMinutes: number
  partySize: number
  status: ReservationStatus
}

interface WaitEntry {
  id: string
  partySize: number
  joinedAt: string
  status: WaitStatus
}

// ─── Estimated wait calculation ───────────────────────────────────────────────

const AVG_MINUTES_PER_PARTY = 20

function calcEstimatedWait(queue: WaitEntry[], position: number): number {
  // position is 0-based index in queue
  return position * AVG_MINUTES_PER_PARTY
}

function getQueuePosition(queue: WaitEntry[], entryId: string): number {
  const waiting = queue.filter(e => e.status === 'WAITING')
  return waiting.findIndex(e => e.id === entryId)
}

// ─── Reservation status transitions ──────────────────────────────────────────

const VALID_TRANSITIONS: Record<ReservationStatus, ReservationStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['SEATED', 'CANCELLED', 'NO_SHOW'],
  SEATED: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
}

function canTransition(from: ReservationStatus, to: ReservationStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to)
}

// ─── Conflict detection ───────────────────────────────────────────────────────

function hasConflict(
  existing: Reservation[],
  tableId: string,
  datetime: string,
  durationMinutes: number,
  excludeId?: string,
): boolean {
  const start = new Date(datetime).getTime()
  const end = start + durationMinutes * 60_000

  return existing
    .filter(r => r.id !== excludeId)
    .filter(r => r.tableId === tableId)
    .filter(r => r.status !== 'CANCELLED' && r.status !== 'NO_SHOW')
    .some(r => {
      const rStart = new Date(r.datetime).getTime()
      const rEnd = rStart + r.durationMinutes * 60_000
      return start < rEnd && end > rStart
    })
}

// ─── Party size validation ────────────────────────────────────────────────────

function validatePartySize(size: number, tableCapacity: number): string | null {
  if (!Number.isInteger(size) || size < 1) return 'Party size must be at least 1'
  if (size > tableCapacity) return `Party size exceeds table capacity of ${tableCapacity}`
  return null
}

function validatePartySizeNoTable(size: number): string | null {
  if (!Number.isInteger(size) || size < 1) return 'Party size must be at least 1'
  if (size > 99) return 'Party size too large'
  return null
}

// ═════════════════════════════════════════════════════════════════════════════
// Tests
// ═════════════════════════════════════════════════════════════════════════════

describe('Estimated wait calculation', () => {
  it('returns 0 minutes for first in queue (position 0)', () => {
    const queue: WaitEntry[] = [
      { id: 'w1', partySize: 2, joinedAt: new Date().toISOString(), status: 'WAITING' },
    ]
    expect(calcEstimatedWait(queue, 0)).toBe(0)
  })

  it('returns 20 min for second in queue (position 1)', () => {
    const queue: WaitEntry[] = [
      { id: 'w1', partySize: 2, joinedAt: new Date().toISOString(), status: 'WAITING' },
      { id: 'w2', partySize: 3, joinedAt: new Date().toISOString(), status: 'WAITING' },
    ]
    expect(calcEstimatedWait(queue, 1)).toBe(20)
  })

  it('returns 60 min for fourth in queue (position 3)', () => {
    expect(calcEstimatedWait([], 3)).toBe(60)
  })

  it('getQueuePosition skips SEATED/CANCELLED entries', () => {
    const queue: WaitEntry[] = [
      { id: 'w1', partySize: 2, joinedAt: new Date().toISOString(), status: 'SEATED' },
      { id: 'w2', partySize: 2, joinedAt: new Date().toISOString(), status: 'WAITING' },
      { id: 'w3', partySize: 2, joinedAt: new Date().toISOString(), status: 'WAITING' },
    ]
    // w2 is first WAITING => position 0, w3 is position 1
    expect(getQueuePosition(queue, 'w2')).toBe(0)
    expect(getQueuePosition(queue, 'w3')).toBe(1)
  })
})

describe('Reservation status transitions', () => {
  it('allows PENDING → CONFIRMED', () => {
    expect(canTransition('PENDING', 'CONFIRMED')).toBe(true)
  })

  it('allows CONFIRMED → SEATED', () => {
    expect(canTransition('CONFIRMED', 'SEATED')).toBe(true)
  })

  it('allows SEATED → COMPLETED', () => {
    expect(canTransition('SEATED', 'COMPLETED')).toBe(true)
  })

  it('denies COMPLETED → any state (terminal)', () => {
    expect(canTransition('COMPLETED', 'CANCELLED')).toBe(false)
    expect(canTransition('COMPLETED', 'PENDING')).toBe(false)
  })

  it('allows CONFIRMED → NO_SHOW', () => {
    expect(canTransition('CONFIRMED', 'NO_SHOW')).toBe(true)
  })
})

describe('Conflict detection (same table, overlapping time)', () => {
  const base = '2025-01-15T18:00:00.000Z'
  const existing: Reservation[] = [
    {
      id: 'r1',
      tableId: 'tbl-1',
      datetime: base,
      durationMinutes: 90,
      partySize: 4,
      status: 'CONFIRMED',
    },
  ]

  it('detects overlap for same table at same time', () => {
    expect(hasConflict(existing, 'tbl-1', base, 90)).toBe(true)
  })

  it('detects overlap when new booking starts during existing', () => {
    const midway = new Date(new Date(base).getTime() + 30 * 60_000).toISOString()
    expect(hasConflict(existing, 'tbl-1', midway, 60)).toBe(true)
  })

  it('no conflict for different table', () => {
    expect(hasConflict(existing, 'tbl-2', base, 90)).toBe(false)
  })

  it('no conflict when booking is after existing ends', () => {
    const after = new Date(new Date(base).getTime() + 120 * 60_000).toISOString()
    expect(hasConflict(existing, 'tbl-1', after, 60)).toBe(false)
  })

  it('ignores CANCELLED reservations when checking conflicts', () => {
    const cancelledExisting: Reservation[] = [{ ...existing[0], status: 'CANCELLED' }]
    expect(hasConflict(cancelledExisting, 'tbl-1', base, 90)).toBe(false)
  })
})

describe('Party size validation', () => {
  it('accepts valid party size within capacity', () => {
    expect(validatePartySize(4, 6)).toBeNull()
  })

  it('rejects party size exceeding table capacity', () => {
    expect(validatePartySize(7, 6)).toBe('Party size exceeds table capacity of 6')
  })

  it('rejects zero or negative party size', () => {
    expect(validatePartySize(0, 4)).toBe('Party size must be at least 1')
    expect(validatePartySize(-1, 4)).toBe('Party size must be at least 1')
  })

  it('rejects non-integer party size', () => {
    expect(validatePartySizeNoTable(2.5)).toBe('Party size must be at least 1')
  })
})
