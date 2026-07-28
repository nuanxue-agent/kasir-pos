import { describe, it, expect } from 'vitest'
import {
  getActionSeverity,
  isMoreSevere,
  sortActionsBySeverity,
  isAcknowledged,
  acknowledgeAction,
  countActionsByType,
  getEmployeeActionCount,
  shouldEscalateToSuspension,
  recommendNextAction,
  getIncidentSeverityLevel,
  isHighSeverity,
  classifySeverityFromScore,
  getIncidentsForEmployee,
  getOpenIncidents,
  type DisciplinaryAction,
  type Incident,
} from '@/lib/disciplinary'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const baseAction = (overrides: Partial<DisciplinaryAction> = {}): DisciplinaryAction => ({
  id: 'a1',
  storeId: 's1',
  employeeId: 'emp1',
  type: 'VERBAL_WARNING',
  reason: 'Late arrival',
  description: '',
  date: '2025-01-10',
  issuedBy: 'Manager A',
  acknowledged: false,
  acknowledgedAt: null,
  createdAt: '2025-01-10T08:00:00Z',
  ...overrides,
})

const baseIncident = (overrides: Partial<Incident> = {}): Incident => ({
  id: 'i1',
  storeId: 's1',
  reportedBy: 'emp2',
  involvedEmployees: ['emp1'],
  type: 'MISCONDUCT',
  description: 'Argument on floor',
  severity: 'MEDIUM',
  status: 'OPEN',
  createdAt: '2025-01-11T09:00:00Z',
  ...overrides,
})

// Employee with 2 verbal + 1 written (should trigger escalation)
const escalationActions: DisciplinaryAction[] = [
  baseAction({ id: 'a1', type: 'VERBAL_WARNING' }),
  baseAction({ id: 'a2', type: 'VERBAL_WARNING' }),
  baseAction({ id: 'a3', type: 'WRITTEN_WARNING' }),
]

// ─── Action type severity ordering ───────────────────────────────────────────

describe('Action type severity ordering', () => {
  it('VERBAL_WARNING should have severity 1', () => {
    expect(getActionSeverity('VERBAL_WARNING')).toBe(1)
  })

  it('WRITTEN_WARNING should be more severe than VERBAL_WARNING', () => {
    expect(isMoreSevere('WRITTEN_WARNING', 'VERBAL_WARNING')).toBe(true)
  })

  it('SUSPENSION should be more severe than WRITTEN_WARNING', () => {
    expect(isMoreSevere('SUSPENSION', 'WRITTEN_WARNING')).toBe(true)
  })

  it('TERMINATION should have highest severity', () => {
    expect(getActionSeverity('TERMINATION')).toBe(4)
    expect(isMoreSevere('TERMINATION', 'SUSPENSION')).toBe(true)
  })

  it('should sort action types from least to most severe', () => {
    const unsorted = ['TERMINATION', 'VERBAL_WARNING', 'SUSPENSION', 'WRITTEN_WARNING'] as const
    const sorted = sortActionsBySeverity([...unsorted])
    expect(sorted).toEqual(['VERBAL_WARNING', 'WRITTEN_WARNING', 'SUSPENSION', 'TERMINATION'])
  })

  it('isMoreSevere should return false when comparing equal types', () => {
    expect(isMoreSevere('VERBAL_WARNING', 'VERBAL_WARNING')).toBe(false)
  })
})

// ─── Acknowledgement tracking ─────────────────────────────────────────────────

describe('Acknowledgement tracking', () => {
  it('unacknowledged action should return false from isAcknowledged', () => {
    const action = baseAction({ acknowledged: false, acknowledgedAt: null })
    expect(isAcknowledged(action)).toBe(false)
  })

  it('acknowledged action should return true from isAcknowledged', () => {
    const action = baseAction({ acknowledged: true, acknowledgedAt: '2025-01-10T10:00:00Z' })
    expect(isAcknowledged(action)).toBe(true)
  })

  it('acknowledgeAction should set acknowledged=true and record timestamp', () => {
    const action = baseAction()
    const ts = '2025-01-10T12:00:00Z'
    const updated = acknowledgeAction(action, ts)
    expect(updated.acknowledged).toBe(true)
    expect(updated.acknowledgedAt).toBe(ts)
  })

  it('acknowledgeAction should not mutate the original action', () => {
    const action = baseAction()
    acknowledgeAction(action, '2025-01-10T12:00:00Z')
    expect(action.acknowledged).toBe(false)
    expect(action.acknowledgedAt).toBeNull()
  })
})

// ─── Employee action history count ───────────────────────────────────────────

describe('Employee action history count', () => {
  it('countActionsByType should count each type correctly', () => {
    const counts = countActionsByType(escalationActions, 'emp1')
    expect(counts.VERBAL_WARNING).toBe(2)
    expect(counts.WRITTEN_WARNING).toBe(1)
    expect(counts.SUSPENSION).toBe(0)
    expect(counts.TERMINATION).toBe(0)
  })

  it('getEmployeeActionCount should return total action count', () => {
    expect(getEmployeeActionCount(escalationActions, 'emp1')).toBe(3)
  })

  it('getEmployeeActionCount should return 0 for employee with no actions', () => {
    expect(getEmployeeActionCount(escalationActions, 'emp_nobody')).toBe(0)
  })
})

// ─── Escalation logic ─────────────────────────────────────────────────────────

describe('Escalation logic (3 warnings → suspension)', () => {
  it('should recommend suspension when employee has 3+ warnings', () => {
    expect(shouldEscalateToSuspension(escalationActions, 'emp1')).toBe(true)
  })

  it('should NOT escalate when employee has fewer than 3 warnings', () => {
    const twoWarnings = escalationActions.slice(0, 2)
    expect(shouldEscalateToSuspension(twoWarnings, 'emp1')).toBe(false)
  })

  it('recommendNextAction should return SUSPENSION after 3 warnings', () => {
    expect(recommendNextAction(escalationActions, 'emp1')).toBe('SUSPENSION')
  })

  it('recommendNextAction should return WRITTEN_WARNING after 1 verbal warning', () => {
    const oneVerbal = [baseAction({ id: 'a1', type: 'VERBAL_WARNING' })]
    expect(recommendNextAction(oneVerbal, 'emp1')).toBe('WRITTEN_WARNING')
  })

  it('recommendNextAction should return VERBAL_WARNING for clean employee', () => {
    expect(recommendNextAction([], 'emp1')).toBe('VERBAL_WARNING')
  })
})

// ─── Incident severity classification ────────────────────────────────────────

describe('Incident severity classification', () => {
  it('score >= 7 should classify as HIGH', () => {
    expect(classifySeverityFromScore(7)).toBe('HIGH')
    expect(classifySeverityFromScore(10)).toBe('HIGH')
  })

  it('score 4-6 should classify as MEDIUM', () => {
    expect(classifySeverityFromScore(4)).toBe('MEDIUM')
    expect(classifySeverityFromScore(6)).toBe('MEDIUM')
  })

  it('score < 4 should classify as LOW', () => {
    expect(classifySeverityFromScore(0)).toBe('LOW')
    expect(classifySeverityFromScore(3)).toBe('LOW')
  })

  it('isHighSeverity should return true only for HIGH', () => {
    expect(isHighSeverity('HIGH')).toBe(true)
    expect(isHighSeverity('MEDIUM')).toBe(false)
    expect(isHighSeverity('LOW')).toBe(false)
  })

  it('getIncidentSeverityLevel should return numeric levels in correct order', () => {
    expect(getIncidentSeverityLevel('LOW')).toBeLessThan(getIncidentSeverityLevel('MEDIUM'))
    expect(getIncidentSeverityLevel('MEDIUM')).toBeLessThan(getIncidentSeverityLevel('HIGH'))
  })

  it('getIncidentsForEmployee should filter by employee involvement', () => {
    const incidents = [
      baseIncident({ id: 'i1', involvedEmployees: ['emp1', 'emp2'] }),
      baseIncident({ id: 'i2', involvedEmployees: ['emp3'] }),
      baseIncident({ id: 'i3', involvedEmployees: ['emp1'] }),
    ]
    const result = getIncidentsForEmployee(incidents, 'emp1')
    expect(result).toHaveLength(2)
    expect(result.map(i => i.id)).toEqual(['i1', 'i3'])
  })

  it('getOpenIncidents should exclude resolved incidents', () => {
    const incidents = [
      baseIncident({ id: 'i1', status: 'OPEN' }),
      baseIncident({ id: 'i2', status: 'RESOLVED' }),
      baseIncident({ id: 'i3', status: 'INVESTIGATING' }),
    ]
    const open = getOpenIncidents(incidents)
    expect(open).toHaveLength(2)
    expect(open.every(i => i.status !== 'RESOLVED')).toBe(true)
  })
})
