import { describe, it, expect } from 'vitest'

// ── Pure business-logic helpers ────────────────────────────────────────────────

type Role = 'CASHIER' | 'WAITER' | 'KITCHEN' | 'MANAGER'
type ShiftStatus = 'SCHEDULED' | 'CONFIRMED' | 'COMPLETED' | 'ABSENT'
type SwapStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

interface Shift {
  id: string
  employeeId: string
  date: string
  startTime: string
  endTime: string
  role: Role
  status: ShiftStatus
}

interface ShiftSwapRequest {
  requesterId: string
  targetId: string
  shiftId: string
  existingSwaps: Array<{ shiftId: string; status: SwapStatus }>
}

const ROLE_MINIMUMS: Record<Role, number> = {
  CASHIER: 1,
  WAITER: 2,
  KITCHEN: 1,
  MANAGER: 1,
}

/** Returns true if two shifts for the same employee overlap in time */
function shiftsOverlap(a: Shift, b: Shift): boolean {
  if (a.employeeId !== b.employeeId || a.date !== b.date) return false
  const toMins = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    return h * 60 + m
  }
  const aStart = toMins(a.startTime)
  const aEnd = toMins(a.endTime)
  const bStart = toMins(b.startTime)
  const bEnd = toMins(b.endTime)
  return aStart < bEnd && bStart < aEnd
}

/** Calculate total hours worked in a week for an employee */
function calcWeeklyHours(shifts: Shift[], employeeId: string): number {
  return shifts
    .filter(s => s.employeeId === employeeId && s.status !== 'ABSENT')
    .reduce((total, s) => {
      const [sh, sm] = s.startTime.split(':').map(Number)
      const [eh, em] = s.endTime.split(':').map(Number)
      const mins = (eh * 60 + em) - (sh * 60 + sm)
      return total + Math.max(0, mins) / 60
    }, 0)
}

/** Detect coverage gaps: dates+roles below minimum required staffing */
function detectCoverageGaps(
  shifts: Shift[],
  dates: string[],
): Array<{ date: string; role: Role; scheduled: number; required: number }> {
  const gaps: Array<{ date: string; role: Role; scheduled: number; required: number }> = []
  for (const date of dates) {
    for (const role of Object.keys(ROLE_MINIMUMS) as Role[]) {
      const scheduled = shifts.filter(
        s => s.date === date && s.role === role && (s.status === 'SCHEDULED' || s.status === 'CONFIRMED')
      ).length
      const required = ROLE_MINIMUMS[role]
      if (scheduled < required) gaps.push({ date, role, scheduled, required })
    }
  }
  return gaps
}

/** Validate a shift swap request */
function validateSwap(req: ShiftSwapRequest): { valid: boolean; reason?: string } {
  if (req.requesterId === req.targetId) {
    return { valid: false, reason: 'Cannot swap with yourself' }
  }
  const alreadyPending = req.existingSwaps.some(
    s => s.shiftId === req.shiftId && s.status === 'PENDING'
  )
  if (alreadyPending) {
    return { valid: false, reason: 'A pending swap request already exists for this shift' }
  }
  return { valid: true }
}

/** Copy shifts from one week to another (offset by 7 days), reset status to SCHEDULED */
function copyWeekShifts(shifts: Shift[], fromWeekStart: string, toWeekStart: string): Omit<Shift, 'id'>[] {
  const fromStart = new Date(fromWeekStart).getTime()
  const fromEnd = fromStart + 6 * 86400000
  const toStart = new Date(toWeekStart).getTime()
  const diffMs = toStart - fromStart

  return shifts
    .filter(s => {
      const d = new Date(s.date).getTime()
      return d >= fromStart && d <= fromEnd
    })
    .map(s => ({
      employeeId: s.employeeId,
      date: new Date(new Date(s.date).getTime() + diffMs).toISOString().slice(0, 10),
      startTime: s.startTime,
      endTime: s.endTime,
      role: s.role,
      status: 'SCHEDULED' as ShiftStatus,
    }))
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('Shift Scheduler — business logic', () => {

  // Overlap detection (3 tests)
  describe('shiftsOverlap', () => {
    it('detects overlap for same employee same day', () => {
      const a: Shift = { id: '1', employeeId: 'e1', date: '2025-07-07', startTime: '08:00', endTime: '14:00', role: 'CASHIER', status: 'SCHEDULED' }
      const b: Shift = { id: '2', employeeId: 'e1', date: '2025-07-07', startTime: '12:00', endTime: '18:00', role: 'CASHIER', status: 'SCHEDULED' }
      expect(shiftsOverlap(a, b)).toBe(true)
    })

    it('returns false for adjacent (non-overlapping) shifts', () => {
      const a: Shift = { id: '1', employeeId: 'e1', date: '2025-07-07', startTime: '08:00', endTime: '14:00', role: 'CASHIER', status: 'SCHEDULED' }
      const b: Shift = { id: '2', employeeId: 'e1', date: '2025-07-07', startTime: '14:00', endTime: '20:00', role: 'CASHIER', status: 'SCHEDULED' }
      expect(shiftsOverlap(a, b)).toBe(false)
    })

    it('returns false for different employees same time', () => {
      const a: Shift = { id: '1', employeeId: 'e1', date: '2025-07-07', startTime: '08:00', endTime: '16:00', role: 'CASHIER', status: 'SCHEDULED' }
      const b: Shift = { id: '2', employeeId: 'e2', date: '2025-07-07', startTime: '08:00', endTime: '16:00', role: 'CASHIER', status: 'SCHEDULED' }
      expect(shiftsOverlap(a, b)).toBe(false)
    })
  })

  // Weekly hours (3 tests)
  describe('calcWeeklyHours', () => {
    it('sums hours correctly for multiple shifts', () => {
      const shifts: Shift[] = [
        { id: '1', employeeId: 'e1', date: '2025-07-07', startTime: '08:00', endTime: '16:00', role: 'CASHIER', status: 'SCHEDULED' },
        { id: '2', employeeId: 'e1', date: '2025-07-08', startTime: '09:00', endTime: '13:00', role: 'CASHIER', status: 'CONFIRMED' },
      ]
      expect(calcWeeklyHours(shifts, 'e1')).toBe(12)
    })

    it('excludes ABSENT shifts from total', () => {
      const shifts: Shift[] = [
        { id: '1', employeeId: 'e1', date: '2025-07-07', startTime: '08:00', endTime: '16:00', role: 'CASHIER', status: 'ABSENT' },
        { id: '2', employeeId: 'e1', date: '2025-07-08', startTime: '08:00', endTime: '12:00', role: 'CASHIER', status: 'SCHEDULED' },
      ]
      expect(calcWeeklyHours(shifts, 'e1')).toBe(4)
    })

    it('returns 0 for employee with no shifts', () => {
      const shifts: Shift[] = [
        { id: '1', employeeId: 'e2', date: '2025-07-07', startTime: '08:00', endTime: '16:00', role: 'CASHIER', status: 'SCHEDULED' },
      ]
      expect(calcWeeklyHours(shifts, 'e1')).toBe(0)
    })
  })

  // Coverage gap detection (2 tests)
  describe('detectCoverageGaps', () => {
    it('flags roles with zero coverage', () => {
      const gaps = detectCoverageGaps([], ['2025-07-07'])
      expect(gaps.length).toBeGreaterThan(0)
      expect(gaps.every(g => g.scheduled === 0)).toBe(true)
    })

    it('does not flag roles meeting minimum', () => {
      const shifts: Shift[] = [
        { id: '1', employeeId: 'e1', date: '2025-07-07', startTime: '08:00', endTime: '16:00', role: 'CASHIER', status: 'SCHEDULED' },
        { id: '2', employeeId: 'e2', date: '2025-07-07', startTime: '08:00', endTime: '16:00', role: 'WAITER', status: 'SCHEDULED' },
        { id: '3', employeeId: 'e3', date: '2025-07-07', startTime: '08:00', endTime: '16:00', role: 'WAITER', status: 'CONFIRMED' },
        { id: '4', employeeId: 'e4', date: '2025-07-07', startTime: '08:00', endTime: '16:00', role: 'KITCHEN', status: 'SCHEDULED' },
        { id: '5', employeeId: 'e5', date: '2025-07-07', startTime: '08:00', endTime: '16:00', role: 'MANAGER', status: 'SCHEDULED' },
      ]
      const gaps = detectCoverageGaps(shifts, ['2025-07-07'])
      expect(gaps.length).toBe(0)
    })
  })

  // Swap validation (2 tests)
  describe('validateSwap', () => {
    it('rejects swap with yourself', () => {
      const result = validateSwap({ requesterId: 'e1', targetId: 'e1', shiftId: 's1', existingSwaps: [] })
      expect(result.valid).toBe(false)
      expect(result.reason).toMatch(/yourself/i)
    })

    it('rejects duplicate pending swap for same shift', () => {
      const result = validateSwap({
        requesterId: 'e1', targetId: 'e2', shiftId: 's1',
        existingSwaps: [{ shiftId: 's1', status: 'PENDING' }],
      })
      expect(result.valid).toBe(false)
      expect(result.reason).toMatch(/pending/i)
    })
  })

  // Schedule copy logic (2 tests)
  describe('copyWeekShifts', () => {
    const baseShifts: Shift[] = [
      { id: '1', employeeId: 'e1', date: '2025-07-07', startTime: '08:00', endTime: '16:00', role: 'CASHIER', status: 'CONFIRMED' },
      { id: '2', employeeId: 'e2', date: '2025-07-09', startTime: '10:00', endTime: '18:00', role: 'WAITER', status: 'COMPLETED' },
    ]

    it('copies shifts to new week with SCHEDULED status', () => {
      const copied = copyWeekShifts(baseShifts, '2025-07-07', '2025-07-14')
      expect(copied).toHaveLength(2)
      expect(copied.every(s => s.status === 'SCHEDULED')).toBe(true)
    })

    it('correctly offsets dates by 7 days', () => {
      const copied = copyWeekShifts(baseShifts, '2025-07-07', '2025-07-14')
      expect(copied[0].date).toBe('2025-07-14')
      expect(copied[1].date).toBe('2025-07-16')
    })
  })

})
