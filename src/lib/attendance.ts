// Pure attendance business logic — no DB deps, no Next.js imports
// Used by API routes and unit tests

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'HALF_DAY' | 'LEAVE'

export interface AttendanceSetting {
  workStartTime: string      // HH:MM, e.g. "08:00"
  workEndTime: string        // HH:MM, e.g. "17:00"
  lateThresholdMinutes: number  // minutes after workStartTime before marked LATE
  graceMinutes: number          // grace period for early leave
}

export interface AttendanceRecord {
  id: string
  storeId: string
  employeeId: string
  date: string       // YYYY-MM-DD
  clockIn: string | null   // ISO timestamp
  clockOut: string | null  // ISO timestamp
  status: AttendanceStatus
  lateMinutes: number
  earlyLeaveMinutes: number
  notes: string
}

export interface MonthlySummary {
  employeeId: string
  employeeName?: string
  month: string   // YYYY-MM
  totalDays: number
  presentDays: number
  absentDays: number
  lateDays: number
  halfDays: number
  leaveDays: number
  totalLateMinutes: number
  totalEarlyLeaveMinutes: number
  totalWorkingMinutes: number
  attendanceRate: number  // 0–100
}

/**
 * Parse "HH:MM" into total minutes from midnight
 */
export function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

/**
 * Extract HH:MM minutes-from-midnight from an ISO timestamp string
 * without converting to local time — reads the HH:MM portion directly.
 * Works for both "2025-01-01T08:30:00.000Z" and "2025-01-01T08:30:00".
 */
function isoToMinutes(iso: string): number {
  // ISO format: YYYY-MM-DDTHH:MM:SS...
  const timePart = iso.includes('T') ? iso.split('T')[1] : iso
  const [h, m] = timePart.split(':').map(Number)
  return h * 60 + m
}

/**
 * Calculate how many minutes late an employee clocked in.
 * Returns 0 if on time (within grace period).
 */
export function calcLateMinutes(
  clockInISO: string,
  setting: Pick<AttendanceSetting, 'workStartTime' | 'lateThresholdMinutes'>,
): number {
  const clockInMinutes = isoToMinutes(clockInISO)
  const workStartMinutes = parseTimeToMinutes(setting.workStartTime)
  const diff = clockInMinutes - workStartMinutes
  if (diff <= setting.lateThresholdMinutes) return 0
  return diff
}

/**
 * Calculate how many minutes early an employee clocked out.
 * Returns 0 if they stayed until end of work (within grace).
 */
export function calcEarlyLeaveMinutes(
  clockOutISO: string,
  setting: Pick<AttendanceSetting, 'workEndTime' | 'graceMinutes'>,
): number {
  const clockOutMinutes = isoToMinutes(clockOutISO)
  const workEndMinutes = parseTimeToMinutes(setting.workEndTime)
  const diff = workEndMinutes - clockOutMinutes
  if (diff <= setting.graceMinutes) return 0
  return diff
}

/**
 * Calculate total working minutes between clock-in and clock-out.
 */
export function calcWorkingMinutes(clockInISO: string, clockOutISO: string): number {
  const start = new Date(clockInISO).getTime()
  const end = new Date(clockOutISO).getTime()
  if (end <= start) return 0
  return Math.floor((end - start) / 60000)
}

/**
 * Determine attendance status from clock-in/out and settings.
 * LEAVE is set externally (from leave requests).
 */
export function determineAttendanceStatus(
  clockIn: string | null,
  clockOut: string | null,
  setting: AttendanceSetting,
): AttendanceStatus {
  if (!clockIn) return 'ABSENT'

  const lateMin = calcLateMinutes(clockIn, setting)
  const workMinutes = clockOut ? calcWorkingMinutes(clockIn, clockOut) : 0
  const totalWorkMinutes =
    parseTimeToMinutes(setting.workEndTime) - parseTimeToMinutes(setting.workStartTime)

  // Half day: worked less than 50% of the scheduled hours
  if (clockOut && workMinutes < totalWorkMinutes * 0.5) return 'HALF_DAY'

  if (lateMin > 0) return 'LATE'
  return 'PRESENT'
}

/**
 * Aggregate attendance records into a monthly summary for one employee.
 */
export function calcMonthlySummary(
  records: AttendanceRecord[],
  employeeId: string,
  month: string, // YYYY-MM
  employeeName?: string,
): MonthlySummary {
  const filtered = records.filter(
    (r) => r.employeeId === employeeId && r.date.startsWith(month),
  )

  const totalDays = filtered.length
  const presentDays = filtered.filter((r) => r.status === 'PRESENT').length
  const absentDays = filtered.filter((r) => r.status === 'ABSENT').length
  const lateDays = filtered.filter((r) => r.status === 'LATE').length
  const halfDays = filtered.filter((r) => r.status === 'HALF_DAY').length
  const leaveDays = filtered.filter((r) => r.status === 'LEAVE').length

  const totalLateMinutes = filtered.reduce((s, r) => s + (r.lateMinutes ?? 0), 0)
  const totalEarlyLeaveMinutes = filtered.reduce((s, r) => s + (r.earlyLeaveMinutes ?? 0), 0)

  const totalWorkingMinutes = filtered.reduce((s, r) => {
    if (r.clockIn && r.clockOut) return s + calcWorkingMinutes(r.clockIn, r.clockOut)
    return s
  }, 0)

  const workDays = totalDays - absentDays
  const attendanceRate = totalDays > 0 ? Math.round((workDays / totalDays) * 100) : 0

  return {
    employeeId,
    employeeName,
    month,
    totalDays,
    presentDays,
    absentDays,
    lateDays,
    halfDays,
    leaveDays,
    totalLateMinutes,
    totalEarlyLeaveMinutes,
    totalWorkingMinutes,
    attendanceRate,
  }
}

/**
 * Aggregate records from multiple employees into per-employee summaries.
 */
export function calcAllEmployeeSummaries(
  records: AttendanceRecord[],
  month: string,
  employeeNames: Record<string, string> = {},
): MonthlySummary[] {
  const idSet = new Set(records.map((r) => r.employeeId))
  const ids = Array.from(idSet)
  return ids.map((id) => calcMonthlySummary(records, id, month, employeeNames[id]))
}
