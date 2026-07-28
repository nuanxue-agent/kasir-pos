// Pure business logic for disciplinary actions and incident tracking
// Exported for unit testing

export type ActionType = 'VERBAL_WARNING' | 'WRITTEN_WARNING' | 'SUSPENSION' | 'TERMINATION'
export type IncidentType = 'MISCONDUCT' | 'SAFETY' | 'POLICY_VIOLATION' | 'OTHER'
export type IncidentSeverity = 'LOW' | 'MEDIUM' | 'HIGH'
export type IncidentStatus = 'OPEN' | 'INVESTIGATING' | 'RESOLVED'

export interface DisciplinaryAction {
  id: string
  storeId: string
  employeeId: string
  type: ActionType
  reason: string
  description: string
  date: string
  issuedBy: string
  acknowledged: boolean
  acknowledgedAt: string | null
  createdAt: string
}

export interface Incident {
  id: string
  storeId: string
  reportedBy: string
  involvedEmployees: string[]
  type: IncidentType
  description: string
  severity: IncidentSeverity
  status: IncidentStatus
  createdAt: string
}

/** Severity ordering: higher number = more severe */
const ACTION_SEVERITY: Record<ActionType, number> = {
  VERBAL_WARNING: 1,
  WRITTEN_WARNING: 2,
  SUSPENSION: 3,
  TERMINATION: 4,
}

/** Returns numeric severity for a given action type */
export function getActionSeverity(type: ActionType): number {
  return ACTION_SEVERITY[type]
}

/** Returns true if actionA is more severe than actionB */
export function isMoreSevere(a: ActionType, b: ActionType): boolean {
  return ACTION_SEVERITY[a] > ACTION_SEVERITY[b]
}

/** Sort action types from least to most severe */
export function sortActionsBySeverity(types: ActionType[]): ActionType[] {
  return [...types].sort((a, b) => ACTION_SEVERITY[a] - ACTION_SEVERITY[b])
}

/** Returns true if the action has been acknowledged */
export function isAcknowledged(action: DisciplinaryAction): boolean {
  return action.acknowledged && action.acknowledgedAt != null
}

/** Acknowledge an action — returns updated action */
export function acknowledgeAction(
  action: DisciplinaryAction,
  at: string,
): DisciplinaryAction {
  return { ...action, acknowledged: true, acknowledgedAt: at }
}

/** Count actions of each type for an employee */
export function countActionsByType(
  actions: DisciplinaryAction[],
  employeeId: string,
): Record<ActionType, number> {
  const counts: Record<ActionType, number> = {
    VERBAL_WARNING: 0,
    WRITTEN_WARNING: 0,
    SUSPENSION: 0,
    TERMINATION: 0,
  }
  for (const a of actions) {
    if (a.employeeId === employeeId) counts[a.type]++
  }
  return counts
}

/** Total action count for an employee */
export function getEmployeeActionCount(
  actions: DisciplinaryAction[],
  employeeId: string,
): number {
  return actions.filter(a => a.employeeId === employeeId).length
}

/** Escalation rule: if employee has >= 3 warnings (verbal or written), recommend suspension */
export function shouldEscalateToSuspension(
  actions: DisciplinaryAction[],
  employeeId: string,
): boolean {
  const counts = countActionsByType(actions, employeeId)
  const warningCount = counts.VERBAL_WARNING + counts.WRITTEN_WARNING
  return warningCount >= 3
}

/** Returns the recommended next action type based on history */
export function recommendNextAction(
  actions: DisciplinaryAction[],
  employeeId: string,
): ActionType {
  if (shouldEscalateToSuspension(actions, employeeId)) return 'SUSPENSION'
  const counts = countActionsByType(actions, employeeId)
  if (counts.VERBAL_WARNING >= 1) return 'WRITTEN_WARNING'
  return 'VERBAL_WARNING'
}

/** Incident severity ordering */
const INCIDENT_SEVERITY_ORDER: Record<IncidentSeverity, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
}

export function getIncidentSeverityLevel(severity: IncidentSeverity): number {
  return INCIDENT_SEVERITY_ORDER[severity]
}

export function isHighSeverity(severity: IncidentSeverity): boolean {
  return severity === 'HIGH'
}

/** Classify severity from a numeric score (0-10) */
export function classifySeverityFromScore(score: number): IncidentSeverity {
  if (score >= 7) return 'HIGH'
  if (score >= 4) return 'MEDIUM'
  return 'LOW'
}

/** Filter incidents by employee involvement */
export function getIncidentsForEmployee(
  incidents: Incident[],
  employeeId: string,
): Incident[] {
  return incidents.filter(i => i.involvedEmployees.includes(employeeId))
}

/** Returns open incidents (not resolved) */
export function getOpenIncidents(incidents: Incident[]): Incident[] {
  return incidents.filter(i => i.status !== 'RESOLVED')
}
