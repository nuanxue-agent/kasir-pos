import { describe, it, expect } from 'vitest'
import {
  calcLateMinutes,
  calcEarlyLeaveMinutes,
  calcWorkingMinutes,
  determineAttendanceStatus,
  calcMonthlySummary,
  calcAllEmployeeSummaries,
  parseTimeToMinutes,
} from '@/lib/attendance'
import type { AttendanceSetting, AttendanceRecord } from '@/lib/attendance'

const defaultSetting: AttendanceSetting = {
  workStartTime: '08:00',
  workEndTime: '17:00',
  lateThresholdMinutes: 15,
  graceMinutes: 10,
}

// Helper: ISO timestamp on a given date at HH:MM
function ts(date: string, time: string) {
  return `${date}T${time}:00.000Z`
}

// ── 1. parseTimeToMinutes ─────────────────────────────────────────────────────
describe('parseTimeToMinutes', () => {
  it('converts 08:00 to 480', () => {
    expect(parseTimeToMinutes('08:00')).toBe(480)
  })
  it('converts 17:30 to 1050', () => {
    expect(parseTimeToMinutes('17:30')).toBe(1050)
  })
})

// ── 2. Late detection ─────────────────────────────────────────────────────────
describe('calcLateMinutes', () => {
  it('returns 0 when on time (within threshold)', () => {
    // Clock in at 08:10, threshold=15 min → diff=10, not late
    const result = calcLateMinutes(ts('2025-01-01', '08:10'), defaultSetting)
    expect(result).toBe(0)
  })

  it('returns 0 when exactly at threshold', () => {
    // Clock in at 08:15, threshold=15 → diff=15, still not late (<=)
    const result = calcLateMinutes(ts('2025-01-01', '08:15'), defaultSetting)
    expect(result).toBe(0)
  })

  it('returns late minutes when past threshold', () => {
    // Clock in at 08:30, threshold=15 → diff=30 > 15 → 30 min late
    const result = calcLateMinutes(ts('2025-01-01', '08:30'), defaultSetting)
    expect(result).toBe(30)
  })

  it('handles early clock-in (before start time) as 0', () => {
    // Clock in at 07:45 → diff = -15 → 0
    const result = calcLateMinutes(ts('2025-01-01', '07:45'), defaultSetting)
    expect(result).toBe(0)
  })
})

// ── 3. Early leave detection ──────────────────────────────────────────────────
describe('calcEarlyLeaveMinutes', () => {
  it('returns 0 when clocking out on time (within grace)', () => {
    // Clock out at 16:55, grace=10 → workEnd=17:00, diff=5 <= 10 → 0
    const result = calcEarlyLeaveMinutes(ts('2025-01-01', '16:55'), defaultSetting)
    expect(result).toBe(0)
  })

  it('returns early leave minutes when past grace period', () => {
    // Clock out at 16:00, grace=10 → diff=60 > 10 → 60 min early
    const result = calcEarlyLeaveMinutes(ts('2025-01-01', '16:00'), defaultSetting)
    expect(result).toBe(60)
  })

  it('returns 0 when clocking out after end time', () => {
    // Clock out at 17:30 → diff = -30 → 0
    const result = calcEarlyLeaveMinutes(ts('2025-01-01', '17:30'), defaultSetting)
    expect(result).toBe(0)
  })
})

// ── 4. Working hours calculation ──────────────────────────────────────────────
describe('calcWorkingMinutes', () => {
  it('calculates full day working minutes', () => {
    // 08:00 → 17:00 = 540 minutes
    const result = calcWorkingMinutes(
      ts('2025-01-01', '08:00'),
      ts('2025-01-01', '17:00'),
    )
    expect(result).toBe(540)
  })

  it('calculates partial working minutes', () => {
    // 09:30 → 14:00 = 270 minutes
    const result = calcWorkingMinutes(
      ts('2025-01-01', '09:30'),
      ts('2025-01-01', '14:00'),
    )
    expect(result).toBe(270)
  })

  it('returns 0 when clockOut is before clockIn', () => {
    const result = calcWorkingMinutes(
      ts('2025-01-01', '17:00'),
      ts('2025-01-01', '08:00'),
    )
    expect(result).toBe(0)
  })
})

// ── 5. Attendance status determination ───────────────────────────────────────
describe('determineAttendanceStatus', () => {
  it('returns ABSENT when no clockIn', () => {
    expect(determineAttendanceStatus(null, null, defaultSetting)).toBe('ABSENT')
  })

  it('returns PRESENT for on-time full day', () => {
    const status = determineAttendanceStatus(
      ts('2025-01-01', '08:00'),
      ts('2025-01-01', '17:00'),
      defaultSetting,
    )
    expect(status).toBe('PRESENT')
  })

  it('returns LATE when clocked in past threshold', () => {
    const status = determineAttendanceStatus(
      ts('2025-01-01', '09:00'),  // 60 min late
      ts('2025-01-01', '17:00'),
      defaultSetting,
    )
    expect(status).toBe('LATE')
  })

  it('returns HALF_DAY when worked less than 50% of scheduled hours', () => {
    // Full day = 9h = 540 min. Work 3h = 180 min < 270 (50%)
    const status = determineAttendanceStatus(
      ts('2025-01-01', '08:00'),
      ts('2025-01-01', '11:00'),
      defaultSetting,
    )
    expect(status).toBe('HALF_DAY')
  })
})

// ── 6. Monthly summary aggregation ───────────────────────────────────────────
describe('calcMonthlySummary', () => {
  const records: AttendanceRecord[] = [
    { id: '1', storeId: 's1', employeeId: 'e1', date: '2025-01-02', clockIn: ts('2025-01-02', '08:00'), clockOut: ts('2025-01-02', '17:00'), status: 'PRESENT',  lateMinutes: 0,  earlyLeaveMinutes: 0,  notes: '' },
    { id: '2', storeId: 's1', employeeId: 'e1', date: '2025-01-03', clockIn: ts('2025-01-03', '08:30'), clockOut: ts('2025-01-03', '17:00'), status: 'LATE',     lateMinutes: 30, earlyLeaveMinutes: 0,  notes: '' },
    { id: '3', storeId: 's1', employeeId: 'e1', date: '2025-01-04', clockIn: null,                      clockOut: null,                      status: 'ABSENT',   lateMinutes: 0,  earlyLeaveMinutes: 0,  notes: '' },
    { id: '4', storeId: 's1', employeeId: 'e1', date: '2025-01-05', clockIn: ts('2025-01-05', '08:00'), clockOut: ts('2025-01-05', '11:00'), status: 'HALF_DAY', lateMinutes: 0,  earlyLeaveMinutes: 0,  notes: '' },
    { id: '5', storeId: 's1', employeeId: 'e1', date: '2025-01-06', clockIn: null,                      clockOut: null,                      status: 'LEAVE',    lateMinutes: 0,  earlyLeaveMinutes: 0,  notes: 'Annual leave' },
  ]

  it('counts each status correctly', () => {
    const summary = calcMonthlySummary(records, 'e1', '2025-01')
    expect(summary.presentDays).toBe(1)
    expect(summary.lateDays).toBe(1)
    expect(summary.absentDays).toBe(1)
    expect(summary.halfDays).toBe(1)
    expect(summary.leaveDays).toBe(1)
  })

  it('sums total late minutes', () => {
    const summary = calcMonthlySummary(records, 'e1', '2025-01')
    expect(summary.totalLateMinutes).toBe(30)
  })

  it('calculates attendance rate correctly', () => {
    // 5 days total, 1 absent → work days = 4, rate = 80%
    const summary = calcMonthlySummary(records, 'e1', '2025-01')
    expect(summary.attendanceRate).toBe(80)
  })

  it('returns 0 attendance rate for empty records', () => {
    const summary = calcMonthlySummary([], 'e1', '2025-01')
    expect(summary.attendanceRate).toBe(0)
    expect(summary.totalDays).toBe(0)
  })
})

// ── 7. Multi-employee summary aggregation ────────────────────────────────────
describe('calcAllEmployeeSummaries', () => {
  const records: AttendanceRecord[] = [
    { id: '1', storeId: 's1', employeeId: 'e1', date: '2025-02-03', clockIn: ts('2025-02-03', '08:00'), clockOut: ts('2025-02-03', '17:00'), status: 'PRESENT', lateMinutes: 0, earlyLeaveMinutes: 0, notes: '' },
    { id: '2', storeId: 's1', employeeId: 'e2', date: '2025-02-03', clockIn: null, clockOut: null, status: 'ABSENT', lateMinutes: 0, earlyLeaveMinutes: 0, notes: '' },
    { id: '3', storeId: 's1', employeeId: 'e2', date: '2025-02-04', clockIn: ts('2025-02-04', '09:00'), clockOut: ts('2025-02-04', '17:00'), status: 'LATE', lateMinutes: 60, earlyLeaveMinutes: 0, notes: '' },
  ]

  it('produces a summary per unique employee', () => {
    const summaries = calcAllEmployeeSummaries(records, '2025-02')
    expect(summaries).toHaveLength(2)
  })

  it('includes employee name from name map', () => {
    const summaries = calcAllEmployeeSummaries(records, '2025-02', { e1: 'Budi', e2: 'Siti' })
    const e1 = summaries.find((s) => s.employeeId === 'e1')
    expect(e1?.employeeName).toBe('Budi')
  })

  it('correctly aggregates per-employee stats', () => {
    const summaries = calcAllEmployeeSummaries(records, '2025-02')
    const e2 = summaries.find((s) => s.employeeId === 'e2')
    expect(e2?.absentDays).toBe(1)
    expect(e2?.lateDays).toBe(1)
    expect(e2?.totalLateMinutes).toBe(60)
  })
})
