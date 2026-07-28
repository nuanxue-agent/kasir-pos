import { describe, it, expect } from 'vitest'
import {
  buildWeeklyGrid,
  hasShiftConflict,
  validateSwapRequest,
  calcDailyCoverage,
  detectOvertime,
  getWeekStart,
  getWeekDates,
  type ScheduleEntry,
  type ShiftDefinition,
} from '@/lib/shift-planner'

// ── Fixtures ────────────────────────────────────────────────────────────────

const shifts: ShiftDefinition[] = [
  { id: 's1', name: 'Morning', startTime: '08:00', endTime: '16:00', hoursPerDay: 8 },
  { id: 's2', name: 'Evening', startTime: '16:00', endTime: '00:00', hoursPerDay: 8 },
  { id: 's3', name: 'Night',   startTime: '22:00', endTime: '06:00', hoursPerDay: 8 },
  { id: 's4', name: 'Short',   startTime: '09:00', endTime: '13:00', hoursPerDay: 4 },
]

const employees = [
  { id: 'e1', name: 'Alice' },
  { id: 'e2', name: 'Bob' },
  { id: 'e3', name: 'Carol' },
]

function makeEntry(overrides: Partial<ScheduleEntry> = {}): ScheduleEntry {
  return {
    id: 'sch1',
    storeId: 'store1',
    weekStart: '2026-07-27',
    employeeId: 'e1',
    shiftId: 's1',
    dayOfWeek: 1,
    status: 'SCHEDULED',
    ...overrides,
  }
}

const weekEntries: ScheduleEntry[] = [
  makeEntry({ id: 'a1', employeeId: 'e1', dayOfWeek: 0, shiftId: 's1' }),
  makeEntry({ id: 'a2', employeeId: 'e1', dayOfWeek: 1, shiftId: 's1' }),
  makeEntry({ id: 'a3', employeeId: 'e1', dayOfWeek: 2, shiftId: 's1' }),
  makeEntry({ id: 'a4', employeeId: 'e1', dayOfWeek: 3, shiftId: 's1' }),
  makeEntry({ id: 'a5', employeeId: 'e1', dayOfWeek: 4, shiftId: 's1' }),
  makeEntry({ id: 'b1', employeeId: 'e2', dayOfWeek: 0, shiftId: 's2' }),
  makeEntry({ id: 'b2', employeeId: 'e2', dayOfWeek: 1, shiftId: 's2' }),
  makeEntry({ id: 'b3', employeeId: 'e2', dayOfWeek: 2, shiftId: 's2' }),
]

// ── Weekly Grid Generation ───────────────────────────────────────────────────

describe('buildWeeklyGrid', () => {
  it('creates one row per employee', () => {
    const grid = buildWeeklyGrid(weekEntries, employees)
    expect(grid).toHaveLength(3)
    expect(grid[0].employeeId).toBe('e1')
    expect(grid[1].employeeId).toBe('e2')
    expect(grid[2].employeeId).toBe('e3')
  })

  it('creates 7 cells per row (one per day)', () => {
    const grid = buildWeeklyGrid(weekEntries, employees)
    for (const row of grid) {
      expect(row.cells).toHaveLength(7)
    }
  })

  it('places entries in the correct day column', () => {
    const grid = buildWeeklyGrid(weekEntries, employees)
    const alice = grid[0]
    expect(alice.cells[0].entry?.id).toBe('a1') // Sunday
    expect(alice.cells[1].entry?.id).toBe('a2') // Monday
    expect(alice.cells[5].entry).toBeNull()     // Saturday (no shift)
  })

  it('returns null cells for days with no shift', () => {
    const grid = buildWeeklyGrid(weekEntries, employees)
    const carol = grid[2] // Carol has no entries
    expect(carol.cells.every((c) => c.entry === null)).toBe(true)
  })
})

// ── Shift Conflict Detection ─────────────────────────────────────────────────

describe('hasShiftConflict', () => {
  it('detects overlap when morning and short shifts overlap', () => {
    const existing = [makeEntry({ employeeId: 'e1', dayOfWeek: 1, shiftId: 's1' })] // 08:00–16:00
    const conflict = hasShiftConflict(existing, { employeeId: 'e1', dayOfWeek: 1, shiftId: 's4' }, shifts) // 09:00–13:00
    expect(conflict).toBe(true)
  })

  it('no conflict for non-overlapping shifts on same day', () => {
    const existing = [makeEntry({ employeeId: 'e1', dayOfWeek: 1, shiftId: 's1' })] // 08:00–16:00
    const conflict = hasShiftConflict(existing, { employeeId: 'e1', dayOfWeek: 1, shiftId: 's2' }, shifts) // 16:00–00:00
    expect(conflict).toBe(false)
  })

  it('no conflict on a different day', () => {
    const existing = [makeEntry({ employeeId: 'e1', dayOfWeek: 1, shiftId: 's1' })]
    const conflict = hasShiftConflict(existing, { employeeId: 'e1', dayOfWeek: 2, shiftId: 's1' }, shifts)
    expect(conflict).toBe(false)
  })

  it('ABSENT status entries are ignored in conflict check', () => {
    const existing = [makeEntry({ employeeId: 'e1', dayOfWeek: 1, shiftId: 's1', status: 'ABSENT' })]
    const conflict = hasShiftConflict(existing, { employeeId: 'e1', dayOfWeek: 1, shiftId: 's4' }, shifts)
    expect(conflict).toBe(false)
  })
})

// ── Swap Request Validation ──────────────────────────────────────────────────

describe('validateSwapRequest', () => {
  const entry = makeEntry({ id: 'sch1', employeeId: 'e1', status: 'SCHEDULED' })

  it('approves a valid swap request', () => {
    const result = validateSwapRequest({
      requesterId: 'e1',
      targetId: 'e2',
      scheduleId: 'sch1',
      entries: [entry],
    })
    expect(result.valid).toBe(true)
  })

  it('rejects self-swap', () => {
    const result = validateSwapRequest({
      requesterId: 'e1',
      targetId: 'e1',
      scheduleId: 'sch1',
      entries: [entry],
    })
    expect(result.valid).toBe(false)
    expect(result.reason).toMatch(/yourself/)
  })

  it('rejects when requester does not own the shift', () => {
    const result = validateSwapRequest({
      requesterId: 'e2', // e2 doesn't own sch1
      targetId: 'e3',
      scheduleId: 'sch1',
      entries: [entry],
    })
    expect(result.valid).toBe(false)
    expect(result.reason).toMatch(/not assigned/)
  })

  it('rejects swap for ABSENT shift', () => {
    const absentEntry = makeEntry({ id: 'sch1', employeeId: 'e1', status: 'ABSENT' })
    const result = validateSwapRequest({
      requesterId: 'e1',
      targetId: 'e2',
      scheduleId: 'sch1',
      entries: [absentEntry],
    })
    expect(result.valid).toBe(false)
    expect(result.reason).toMatch(/ABSENT/)
  })
})

// ── Coverage Calculation ─────────────────────────────────────────────────────

describe('calcDailyCoverage', () => {
  it('reports correct scheduled count per day', () => {
    const coverage = calcDailyCoverage(weekEntries, 2)
    // Sunday (0): e1 + e2 = 2 → covered
    expect(coverage[0].scheduled).toBe(2)
    expect(coverage[0].covered).toBe(true)
    // Saturday (6): no one
    expect(coverage[6].scheduled).toBe(0)
    expect(coverage[6].covered).toBe(false)
  })

  it('returns 7 coverage entries', () => {
    const coverage = calcDailyCoverage(weekEntries, 1)
    expect(coverage).toHaveLength(7)
  })
})

// ── Overtime Detection ───────────────────────────────────────────────────────

describe('detectOvertime', () => {
  it('detects overtime when weekly hours exceed limit', () => {
    // e1 has 5 × 8h = 40h; with limit 35 → 5h OT
    const result = detectOvertime(weekEntries, shifts, 'e1', 35)
    expect(result.hasOvertime).toBe(true)
    expect(result.totalHours).toBe(40)
    expect(result.overtimeHours).toBe(5)
  })

  it('no overtime when within limit', () => {
    const result = detectOvertime(weekEntries, shifts, 'e1', 40)
    expect(result.hasOvertime).toBe(false)
    expect(result.overtimeHours).toBe(0)
  })

  it('returns zero hours for employee with no shifts', () => {
    const result = detectOvertime(weekEntries, shifts, 'e3', 40)
    expect(result.totalHours).toBe(0)
    expect(result.hasOvertime).toBe(false)
  })
})

// ── Week Start & Dates ───────────────────────────────────────────────────────

describe('getWeekStart', () => {
  it('returns Monday for a Wednesday date (UTC-safe)', () => {
    const result = getWeekStart(new Date('2026-07-29T00:00:00Z')) // Wednesday
    expect(result).toBe('2026-07-27') // Monday
  })

  it('returns same Monday for Monday itself', () => {
    const result = getWeekStart(new Date('2026-07-27T00:00:00Z'))
    expect(result).toBe('2026-07-27')
  })
})

describe('getWeekDates', () => {
  it('returns 7 consecutive dates starting from weekStart', () => {
    const dates = getWeekDates('2026-07-27')
    expect(dates).toHaveLength(7)
    expect(dates[0]).toBe('2026-07-27')
    expect(dates[6]).toBe('2026-08-02')
  })
})
