// Pure business logic for shift planner — no DB, no Next.js imports

export type ShiftStatus = 'SCHEDULED' | 'CONFIRMED' | 'SWAPPED' | 'ABSENT'
export type SwapStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export interface ShiftDefinition {
  id: string
  name: string
  startTime: string // 'HH:MM'
  endTime: string   // 'HH:MM'
  hoursPerDay: number
}

export interface ScheduleEntry {
  id: string
  storeId: string
  weekStart: string     // YYYY-MM-DD (Monday)
  employeeId: string
  shiftId: string
  dayOfWeek: number     // 0=Sun, 1=Mon, ..., 6=Sat
  status: ShiftStatus
  shiftName?: string
  shiftStart?: string
  shiftEnd?: string
  employeeName?: string
}

export interface SwapRequest {
  id: string
  storeId: string
  requesterId: string
  targetId: string
  scheduleId: string
  reason: string
  status: SwapStatus
  requestedAt: string
}

export interface WeeklyGridCell {
  dayOfWeek: number
  entry: ScheduleEntry | null
}

export interface WeeklyGridRow {
  employeeId: string
  employeeName: string
  cells: WeeklyGridCell[]
}

// Build a 7-column weekly grid (days 0–6) for each employee
export function buildWeeklyGrid(
  entries: ScheduleEntry[],
  employees: { id: string; name: string }[],
): WeeklyGridRow[] {
  return employees.map((emp) => {
    const cells: WeeklyGridCell[] = Array.from({ length: 7 }, (_, day) => {
      const entry = entries.find(
        (e) => e.employeeId === emp.id && e.dayOfWeek === day,
      ) ?? null
      return { dayOfWeek: day, entry }
    })
    return { employeeId: emp.id, employeeName: emp.name, cells }
  })
}

// Detect if two shifts overlap on the same day for the same employee
// startTime/endTime are 'HH:MM' strings
export function hasShiftConflict(
  existingEntries: ScheduleEntry[],
  newEntry: { employeeId: string; dayOfWeek: number; shiftId: string },
  shifts: ShiftDefinition[],
): boolean {
  const newShift = shifts.find((s) => s.id === newEntry.shiftId)
  if (!newShift) return false

  const sameDay = existingEntries.filter(
    (e) =>
      e.employeeId === newEntry.employeeId &&
      e.dayOfWeek === newEntry.dayOfWeek &&
      e.status !== 'ABSENT',
  )

  for (const existing of sameDay) {
    const existingShift = shifts.find((s) => s.id === existing.shiftId)
    if (!existingShift) continue
    if (timesOverlap(newShift.startTime, newShift.endTime, existingShift.startTime, existingShift.endTime)) {
      return true
    }
  }
  return false
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function timesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const aS = timeToMinutes(aStart)
  const aE = timeToMinutes(aEnd)
  const bS = timeToMinutes(bStart)
  const bE = timeToMinutes(bEnd)
  // Handle overnight shifts (end < start means crosses midnight)
  const aEndAdj = aE <= aS ? aE + 1440 : aE
  const bEndAdj = bE <= bS ? bE + 1440 : bE
  return aS < bEndAdj && bS < aEndAdj
}

// Validate a swap request: requester must be scheduled, target must differ
export function validateSwapRequest(params: {
  requesterId: string
  targetId: string
  scheduleId: string
  entries: ScheduleEntry[]
}): { valid: boolean; reason?: string } {
  const { requesterId, targetId, scheduleId, entries } = params

  if (requesterId === targetId) {
    return { valid: false, reason: 'Cannot swap with yourself' }
  }

  const entry = entries.find((e) => e.id === scheduleId)
  if (!entry) {
    return { valid: false, reason: 'Schedule entry not found' }
  }

  if (entry.employeeId !== requesterId) {
    return { valid: false, reason: 'Requester is not assigned to this shift' }
  }

  if (entry.status === 'ABSENT' || entry.status === 'SWAPPED') {
    return { valid: false, reason: `Cannot swap a shift with status ${entry.status}` }
  }

  return { valid: true }
}

// Calculate shift coverage per day: how many employees are scheduled
export function calcDailyCoverage(
  entries: ScheduleEntry[],
  requiredPerDay: number,
): { dayOfWeek: number; scheduled: number; covered: boolean }[] {
  return Array.from({ length: 7 }, (_, day) => {
    const scheduled = entries.filter(
      (e) => e.dayOfWeek === day && e.status !== 'ABSENT',
    ).length
    return { dayOfWeek: day, scheduled, covered: scheduled >= requiredPerDay }
  })
}

// Detect overtime: hours worked in week > threshold
export function detectOvertime(
  entries: ScheduleEntry[],
  shifts: ShiftDefinition[],
  employeeId: string,
  weeklyHourLimit = 40,
): { hasOvertime: boolean; totalHours: number; overtimeHours: number } {
  const empEntries = entries.filter(
    (e) => e.employeeId === employeeId && e.status !== 'ABSENT',
  )

  const totalHours = empEntries.reduce((sum, entry) => {
    const shift = shifts.find((s) => s.id === entry.shiftId)
    return sum + (shift?.hoursPerDay ?? 0)
  }, 0)

  const overtimeHours = Math.max(0, totalHours - weeklyHourLimit)
  return { hasOvertime: overtimeHours > 0, totalHours, overtimeHours }
}

// Get the Monday of the week containing a given date (UTC-safe)
export function getWeekStart(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const dow = d.getUTCDay() // 0=Sun
  const diff = dow === 0 ? -6 : 1 - dow // shift to Monday
  d.setUTCDate(d.getUTCDate() + diff)
  return d.toISOString().split('T')[0]
}

// List all 7 dates in a week starting from weekStart (YYYY-MM-DD)
export function getWeekDates(weekStart: string): string[] {
  const base = new Date(weekStart + 'T00:00:00Z')
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base)
    d.setUTCDate(d.getUTCDate() + i)
    return d.toISOString().split('T')[0]
  })
}
