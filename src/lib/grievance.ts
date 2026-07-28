// ─── Grievance & Disciplinary Case Logic ─────────────────────────────────────
// Pure functions — no I/O, fully unit-testable.

export type GrievanceType = 'GRIEVANCE' | 'DISCIPLINARY'
export type GrievanceStatus = 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED' | 'CLOSED'
export type GrievanceSeverity = 'LOW' | 'MEDIUM' | 'HIGH'

export interface Grievance {
  id: string
  storeId: string
  employeeId: string
  type: GrievanceType
  subject: string
  description: string
  status: GrievanceStatus
  severity: GrievanceSeverity
  reportedBy: string
  resolvedBy: string | null
  resolution: string | null
  createdAt: string
  resolvedAt?: string | null
}

export interface GrievanceNote {
  id: string
  grievanceId: string
  storeId: string
  authorId: string
  note: string
  createdAt: string
}

// ─── Status transitions ───────────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<GrievanceStatus, GrievanceStatus[]> = {
  OPEN:         ['UNDER_REVIEW', 'CLOSED'],
  UNDER_REVIEW: ['RESOLVED', 'CLOSED'],
  RESOLVED:     ['CLOSED'],
  CLOSED:       [],
}

export function isValidStatusTransition(
  from: GrievanceStatus,
  to: GrievanceStatus,
): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}

export function getAllowedNextStatuses(status: GrievanceStatus): GrievanceStatus[] {
  return VALID_TRANSITIONS[status] ?? []
}

export function isTerminalStatus(status: GrievanceStatus): boolean {
  return status === 'CLOSED'
}

// ─── Severity helpers ─────────────────────────────────────────────────────────

const SEVERITY_LEVEL: Record<GrievanceSeverity, number> = {
  LOW: 1, MEDIUM: 2, HIGH: 3,
}

export function getSeverityLevel(severity: GrievanceSeverity): number {
  return SEVERITY_LEVEL[severity] ?? 1
}

export function isHigherSeverity(a: GrievanceSeverity, b: GrievanceSeverity): boolean {
  return getSeverityLevel(a) > getSeverityLevel(b)
}

/**
 * Escalate severity if there are already open/under-review HIGH-severity cases
 * for the same employee — second high-severity case stays HIGH (no change needed
 * for LOW/MEDIUM, they escalate to MEDIUM/HIGH respectively).
 */
export function escalateSeverity(
  current: GrievanceSeverity,
  existingOpenCases: Grievance[],
  employeeId: string,
): GrievanceSeverity {
  const openForEmployee = existingOpenCases.filter(
    g => g.employeeId === employeeId && g.status !== 'CLOSED' && g.status !== 'RESOLVED',
  )
  // If the employee already has a HIGH open case, escalate anything below HIGH
  const hasHighOpen = openForEmployee.some(g => g.severity === 'HIGH')
  if (hasHighOpen && current === 'LOW') return 'MEDIUM'
  if (hasHighOpen && current === 'MEDIUM') return 'HIGH'
  return current
}

// ─── Resolution time ──────────────────────────────────────────────────────────

/**
 * Returns resolution time in hours, or null if not yet resolved.
 */
export function resolutionTimeHours(grievance: Grievance): number | null {
  if (grievance.status !== 'RESOLVED' && grievance.status !== 'CLOSED') return null
  const resolvedAt = grievance.resolvedAt ?? null
  if (!resolvedAt) return null
  const created = new Date(grievance.createdAt).getTime()
  const resolved = new Date(resolvedAt).getTime()
  if (isNaN(created) || isNaN(resolved)) return null
  return Math.round((resolved - created) / (1000 * 60 * 60))
}

export function averageResolutionTimeHours(grievances: Grievance[]): number | null {
  const times = grievances.map(resolutionTimeHours).filter((t): t is number => t !== null)
  if (times.length === 0) return null
  return Math.round(times.reduce((a, b) => a + b, 0) / times.length)
}

// ─── Counts & aggregation ─────────────────────────────────────────────────────

export function countOpenCases(grievances: Grievance[]): number {
  return grievances.filter(g => g.status === 'OPEN' || g.status === 'UNDER_REVIEW').length
}

export function countByStatus(grievances: Grievance[]): Record<GrievanceStatus, number> {
  const counts: Record<GrievanceStatus, number> = {
    OPEN: 0, UNDER_REVIEW: 0, RESOLVED: 0, CLOSED: 0,
  }
  for (const g of grievances) counts[g.status] = (counts[g.status] ?? 0) + 1
  return counts
}

export function countBySeverity(grievances: Grievance[]): Record<GrievanceSeverity, number> {
  const counts: Record<GrievanceSeverity, number> = { LOW: 0, MEDIUM: 0, HIGH: 0 }
  for (const g of grievances) counts[g.severity] = (counts[g.severity] ?? 0) + 1
  return counts
}

export interface CaseSummary {
  total: number
  open: number
  underReview: number
  resolved: number
  closed: number
  highSeverity: number
  avgResolutionHours: number | null
}

export function buildCaseSummary(grievances: Grievance[]): CaseSummary {
  const byStatus = countByStatus(grievances)
  const bySeverity = countBySeverity(grievances)
  return {
    total: grievances.length,
    open: byStatus.OPEN,
    underReview: byStatus.UNDER_REVIEW,
    resolved: byStatus.RESOLVED,
    closed: byStatus.CLOSED,
    highSeverity: bySeverity.HIGH,
    avgResolutionHours: averageResolutionTimeHours(grievances),
  }
}
