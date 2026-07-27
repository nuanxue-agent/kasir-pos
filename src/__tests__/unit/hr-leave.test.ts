import { describe, it, expect } from 'vitest'

// ── HR Leave & Attendance business logic ──────────────────────────────────────

type LeaveType = 'ANNUAL' | 'SICK' | 'PERSONAL'
type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED'
type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'LEAVE'

interface LeaveRequest {
  id: string
  employeeId: string
  startDate: string
  endDate: string
  type: LeaveType
  status: LeaveStatus
  reason: string
}

// ── Pure functions ─────────────────────────────────────────────────────────────

/** Inclusive day count between two ISO date strings */
function calcLeaveDuration(startDate: string, endDate: string): number {
  const start = new Date(startDate)
  const end = new Date(endDate)
  if (end < start) return 0
  const diffMs = end.getTime() - start.getTime()
  return Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1
}

/** Annual leave balance: 12 days/year, prorated by months worked */
function calcAnnualLeaveBalance(
  joinDate: string,
  asOf: string = new Date().toISOString().slice(0, 10),
  usedDays: number = 0,
): number {
  const join = new Date(joinDate)
  const ref = new Date(asOf)
  const totalMonths =
    (ref.getFullYear() - join.getFullYear()) * 12 + (ref.getMonth() - join.getMonth())
  if (totalMonths <= 0) return 0
  // Accrue 1 day per month, capped at 12
  const accrued = Math.min(totalMonths, 12)
  return Math.max(0, accrued - usedDays)
}

/** Validate leave request fields */
function validateLeaveRequest(data: any): string | null {
  if (!data.employeeId) return 'employeeId wajib diisi'
  if (!data.startDate) return 'Tanggal mulai wajib diisi'
  if (!data.endDate) return 'Tanggal selesai wajib diisi'
  if (new Date(data.endDate) < new Date(data.startDate))
    return 'Tanggal selesai tidak boleh sebelum tanggal mulai'
  const validTypes: LeaveType[] = ['ANNUAL', 'SICK', 'PERSONAL']
  if (!validTypes.includes(data.type)) return 'Tipe cuti tidak valid'
  if (!data.reason || data.reason.trim().length < 3) return 'Alasan minimal 3 karakter'
  return null
}

/** Approve/reject flow validation */
function validateLeaveStatusTransition(current: LeaveStatus, next: LeaveStatus): string | null {
  if (current !== 'PENDING')
    return `Hanya status PENDING yang bisa diubah, status saat ini: ${current}`
  if (next !== 'APPROVED' && next !== 'REJECTED') return 'Status baru harus APPROVED atau REJECTED'
  return null
}

/** Map raw attendance record status string to typed enum value */
function mapAttendanceStatus(raw: string): AttendanceStatus {
  const map: Record<string, AttendanceStatus> = {
    PRESENT: 'PRESENT',
    ABSENT: 'ABSENT',
    LATE: 'LATE',
    LEAVE: 'LEAVE',
  }
  return map[raw] ?? 'ABSENT'
}

/** Build a calendar grid for the given month/year.
 *  Returns an array of weeks, each week is 7 cells (null = padding day outside month).
 */
function buildCalendarGrid(year: number, month: number): (number | null)[][] {
  // month is 1-indexed
  const firstDay = new Date(year, month - 1, 1)
  const lastDay = new Date(year, month, 0)
  const daysInMonth = lastDay.getDate()
  // 0=Sun … 6=Sat; we want Mon=0 … Sun=6
  const startOffset = (firstDay.getDay() + 6) % 7

  const cells: (number | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  // Pad to complete last row
  while (cells.length % 7 !== 0) cells.push(null)

  const weeks: (number | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7))
  }
  return weeks
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Leave duration calculation', () => {
  it('same day = 1 day', () => {
    expect(calcLeaveDuration('2025-07-01', '2025-07-01')).toBe(1)
  })
  it('two consecutive days = 2 days', () => {
    expect(calcLeaveDuration('2025-07-01', '2025-07-02')).toBe(2)
  })
  it('one week = 7 days', () => {
    expect(calcLeaveDuration('2025-07-07', '2025-07-13')).toBe(7)
  })
  it('returns 0 when end is before start', () => {
    expect(calcLeaveDuration('2025-07-10', '2025-07-05')).toBe(0)
  })
})

describe('Leave balance (annual = 12 days/year)', () => {
  it('returns 0 for brand-new employee (same day)', () => {
    const today = new Date().toISOString().slice(0, 10)
    expect(calcAnnualLeaveBalance(today, today, 0)).toBe(0)
  })
  it('accrues 1 day per month up to 12', () => {
    expect(calcAnnualLeaveBalance('2025-01-01', '2025-07-01', 0)).toBe(6)
  })
  it('caps at 12 days after a full year', () => {
    expect(calcAnnualLeaveBalance('2024-01-01', '2025-01-01', 0)).toBe(12)
  })
  it('deducts used days from balance', () => {
    expect(calcAnnualLeaveBalance('2024-01-01', '2025-01-01', 5)).toBe(7)
  })
})

describe('Approval flow validation', () => {
  it('allows PENDING → APPROVED', () => {
    expect(validateLeaveStatusTransition('PENDING', 'APPROVED')).toBeNull()
  })
  it('allows PENDING → REJECTED', () => {
    expect(validateLeaveStatusTransition('PENDING', 'REJECTED')).toBeNull()
  })
  it('rejects APPROVED → REJECTED transition', () => {
    expect(validateLeaveStatusTransition('APPROVED', 'REJECTED')).not.toBeNull()
  })
  it('rejects REJECTED → APPROVED transition', () => {
    expect(validateLeaveStatusTransition('REJECTED', 'APPROVED')).not.toBeNull()
  })
  it('rejects invalid target status', () => {
    expect(validateLeaveStatusTransition('PENDING', 'PENDING' as any)).not.toBeNull()
  })
})

describe('Attendance status mapping', () => {
  it('maps PRESENT correctly', () => {
    expect(mapAttendanceStatus('PRESENT')).toBe('PRESENT')
  })
  it('maps ABSENT correctly', () => {
    expect(mapAttendanceStatus('ABSENT')).toBe('ABSENT')
  })
  it('maps LATE correctly', () => {
    expect(mapAttendanceStatus('LATE')).toBe('LATE')
  })
  it('maps LEAVE correctly', () => {
    expect(mapAttendanceStatus('LEAVE')).toBe('LEAVE')
  })
  it('unknown value defaults to ABSENT', () => {
    expect(mapAttendanceStatus('UNKNOWN')).toBe('ABSENT')
  })
})

describe('Calendar grid generation', () => {
  it('January 2025 has correct number of weeks', () => {
    // Jan 2025: starts Wednesday → offset 2, 31 days → needs 5 rows
    const grid = buildCalendarGrid(2025, 1)
    expect(grid.length).toBe(5)
    expect(grid.every(w => w.length === 7)).toBe(true)
  })
  it('February 2024 (leap year) has 29 days total', () => {
    const grid = buildCalendarGrid(2024, 2)
    const days = grid.flat().filter(d => d !== null)
    expect(days.length).toBe(29)
  })
  it('February 2025 (non-leap) has 28 days total', () => {
    const grid = buildCalendarGrid(2025, 2)
    const days = grid.flat().filter(d => d !== null)
    expect(days.length).toBe(28)
  })
  it('every week row has exactly 7 cells', () => {
    for (let m = 1; m <= 12; m++) {
      const grid = buildCalendarGrid(2025, m)
      expect(grid.every(w => w.length === 7)).toBe(true)
    }
  })
  it('first non-null cell is always 1', () => {
    const grid = buildCalendarGrid(2025, 7)
    const firstDay = grid.flat().find(d => d !== null)
    expect(firstDay).toBe(1)
  })
  it('last non-null cell matches days in month', () => {
    const grid = buildCalendarGrid(2025, 7) // July = 31 days
    const cells = grid.flat().filter(d => d !== null)
    expect(cells[cells.length - 1]).toBe(31)
  })
})
