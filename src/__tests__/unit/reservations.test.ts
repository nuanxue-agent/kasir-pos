import { describe, it, expect } from 'vitest'
import {
  isValidTransition,
  partySizeFitsTable,
  reservationsConflict,
  findAvailableTables,
  isNoShow,
  type ReservationRow,
  type TableLayout,
  type ReservationStatus,
} from '@/lib/reservations'

// ── helpers ──────────────────────────────────────────────────────────────────

function makeRes(overrides: Partial<ReservationRow> = {}): ReservationRow {
  return {
    id: 'res-1',
    storeId: 'store-1',
    customerName: 'Budi',
    customerPhone: '0812',
    tableId: 'table-1',
    partySize: 2,
    date: '2025-08-01',
    timeSlot: '19:00',
    status: 'PENDING',
    createdAt: '2025-08-01T10:00:00.000Z',
    ...overrides,
  }
}

function makeTable(overrides: Partial<TableLayout> = {}): TableLayout {
  return {
    id: 'table-1',
    storeId: 'store-1',
    number: 'T1',
    capacity: 4,
    section: 'Main',
    active: true,
    ...overrides,
  }
}

// ── 1. Availability check logic ───────────────────────────────────────────────

describe('findAvailableTables', () => {
  it('returns all active tables when no reservations exist', () => {
    const tables = [makeTable(), makeTable({ id: 'table-2', number: 'T2' })]
    const result = findAvailableTables(tables, [], '2025-08-01', '19:00', 2)
    expect(result).toHaveLength(2)
  })

  it('excludes tables already reserved for that date/timeSlot', () => {
    const tables = [makeTable(), makeTable({ id: 'table-2', number: 'T2' })]
    const reservations = [makeRes({ tableId: 'table-1', status: 'CONFIRMED' })]
    const result = findAvailableTables(tables, reservations, '2025-08-01', '19:00', 2)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('table-2')
  })

  it('does not exclude tables whose reservations are CANCELLED', () => {
    const tables = [makeTable()]
    const reservations = [makeRes({ status: 'CANCELLED' })]
    const result = findAvailableTables(tables, reservations, '2025-08-01', '19:00', 2)
    expect(result).toHaveLength(1)
  })
})

// ── 2. Status transition validation ──────────────────────────────────────────

describe('isValidTransition', () => {
  it('allows PENDING → CONFIRMED', () => {
    expect(isValidTransition('PENDING', 'CONFIRMED')).toBe(true)
  })

  it('allows CONFIRMED → SEATED', () => {
    expect(isValidTransition('CONFIRMED', 'SEATED')).toBe(true)
  })

  it('rejects COMPLETED → PENDING (terminal state)', () => {
    expect(isValidTransition('COMPLETED', 'PENDING')).toBe(false)
  })

  it('rejects SEATED → CONFIRMED (backward transition)', () => {
    expect(isValidTransition('SEATED', 'CONFIRMED')).toBe(false)
  })
})

// ── 3. Party size vs capacity check ──────────────────────────────────────────

describe('partySizeFitsTable', () => {
  it('returns true when party size equals capacity', () => {
    expect(partySizeFitsTable(4, 4)).toBe(true)
  })

  it('returns true when party size is less than capacity', () => {
    expect(partySizeFitsTable(2, 4)).toBe(true)
  })

  it('returns false when party size exceeds capacity', () => {
    expect(partySizeFitsTable(6, 4)).toBe(false)
  })

  it('returns false for zero party size', () => {
    expect(partySizeFitsTable(0, 4)).toBe(false)
  })
})

// ── 4. Time slot conflict detection ──────────────────────────────────────────

describe('reservationsConflict', () => {
  it('detects conflict when same table, date, and timeSlot with active statuses', () => {
    const a = makeRes({ id: 'res-1', status: 'CONFIRMED' })
    const b = makeRes({ id: 'res-2', status: 'PENDING' })
    expect(reservationsConflict(a, b)).toBe(true)
  })

  it('no conflict when different time slots', () => {
    const a = makeRes({ id: 'res-1', timeSlot: '19:00', status: 'CONFIRMED' })
    const b = makeRes({ id: 'res-2', timeSlot: '20:00', status: 'PENDING' })
    expect(reservationsConflict(a, b)).toBe(false)
  })

  it('no conflict when one reservation is CANCELLED', () => {
    const a = makeRes({ id: 'res-1', status: 'CANCELLED' })
    const b = makeRes({ id: 'res-2', status: 'CONFIRMED' })
    expect(reservationsConflict(a, b)).toBe(false)
  })

  it('no conflict when different tables at same date/time', () => {
    const a = makeRes({ id: 'res-1', tableId: 'table-1', status: 'CONFIRMED' })
    const b = makeRes({ id: 'res-2', tableId: 'table-2', status: 'CONFIRMED' })
    expect(reservationsConflict(a, b)).toBe(false)
  })
})

// ── 5. No-show detection ──────────────────────────────────────────────────────

describe('isNoShow', () => {
  it('returns true when CONFIRMED reservation is 30+ min past its slot', () => {
    const res = makeRes({ status: 'CONFIRMED', date: '2025-08-01', timeSlot: '19:00' })
    const now = '2025-08-01T19:31:00.000Z' // 31 min after slot
    expect(isNoShow(res, now, 30)).toBe(true)
  })

  it('returns false when CONFIRMED reservation is within threshold', () => {
    const res = makeRes({ status: 'CONFIRMED', date: '2025-08-01', timeSlot: '19:00' })
    const now = '2025-08-01T19:20:00.000Z' // 20 min after
    expect(isNoShow(res, now, 30)).toBe(false)
  })

  it('returns false for non-CONFIRMED statuses', () => {
    const res = makeRes({ status: 'SEATED', date: '2025-08-01', timeSlot: '19:00' })
    const now = '2025-08-01T20:00:00.000Z'
    expect(isNoShow(res, now, 30)).toBe(false)
  })
})
