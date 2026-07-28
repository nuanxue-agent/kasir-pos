import { describe, it, expect } from 'vitest'
import {
  isValidStatusTransition,
  getAllowedNextStatuses,
  isTerminalStatus,
  getSeverityLevel,
  isHigherSeverity,
  escalateSeverity,
  resolutionTimeHours,
  averageResolutionTimeHours,
  countOpenCases,
  countByStatus,
  countBySeverity,
  buildCaseSummary,
  type Grievance,
  type GrievanceStatus,
  type GrievanceSeverity,
} from '@/lib/grievance'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const baseCase = (overrides: Partial<Grievance> = {}): Grievance => ({
  id: 'g1',
  storeId: 's1',
  employeeId: 'emp1',
  type: 'GRIEVANCE',
  subject: 'Test Subject',
  description: 'Test description',
  status: 'OPEN',
  severity: 'LOW',
  reportedBy: 'Manager A',
  resolvedBy: null,
  resolution: null,
  createdAt: '2025-01-10T08:00:00Z',
  resolvedAt: null,
  ...overrides,
})

// ─── Status transition validation ────────────────────────────────────────────

describe('Status transition validation', () => {
  it('OPEN → UNDER_REVIEW is valid', () => {
    expect(isValidStatusTransition('OPEN', 'UNDER_REVIEW')).toBe(true)
  })

  it('OPEN → CLOSED is valid', () => {
    expect(isValidStatusTransition('OPEN', 'CLOSED')).toBe(true)
  })

  it('OPEN → RESOLVED is invalid (must go through UNDER_REVIEW first)', () => {
    expect(isValidStatusTransition('OPEN', 'RESOLVED')).toBe(false)
  })

  it('UNDER_REVIEW → RESOLVED is valid', () => {
    expect(isValidStatusTransition('UNDER_REVIEW', 'RESOLVED')).toBe(true)
  })

  it('RESOLVED → CLOSED is valid', () => {
    expect(isValidStatusTransition('RESOLVED', 'CLOSED')).toBe(true)
  })

  it('CLOSED → any status is invalid (terminal)', () => {
    const targets: GrievanceStatus[] = ['OPEN', 'UNDER_REVIEW', 'RESOLVED', 'CLOSED']
    for (const t of targets) {
      expect(isValidStatusTransition('CLOSED', t)).toBe(false)
    }
  })

  it('getAllowedNextStatuses returns correct set for OPEN', () => {
    const allowed = getAllowedNextStatuses('OPEN')
    expect(allowed).toContain('UNDER_REVIEW')
    expect(allowed).toContain('CLOSED')
    expect(allowed).not.toContain('RESOLVED')
  })

  it('isTerminalStatus returns true only for CLOSED', () => {
    expect(isTerminalStatus('CLOSED')).toBe(true)
    expect(isTerminalStatus('RESOLVED')).toBe(false)
    expect(isTerminalStatus('OPEN')).toBe(false)
  })
})

// ─── Severity escalation logic ────────────────────────────────────────────────

describe('Severity escalation logic', () => {
  it('LOW severity escalates to MEDIUM when employee already has a HIGH open case', () => {
    const existing = [baseCase({ employeeId: 'emp1', severity: 'HIGH', status: 'OPEN' })]
    expect(escalateSeverity('LOW', existing, 'emp1')).toBe('MEDIUM')
  })

  it('MEDIUM severity escalates to HIGH when employee already has a HIGH open case', () => {
    const existing = [baseCase({ employeeId: 'emp1', severity: 'HIGH', status: 'UNDER_REVIEW' })]
    expect(escalateSeverity('MEDIUM', existing, 'emp1')).toBe('HIGH')
  })

  it('HIGH severity stays HIGH regardless of existing cases', () => {
    const existing = [baseCase({ employeeId: 'emp1', severity: 'HIGH', status: 'OPEN' })]
    expect(escalateSeverity('HIGH', existing, 'emp1')).toBe('HIGH')
  })

  it('no escalation when existing HIGH case is already RESOLVED', () => {
    const existing = [baseCase({ employeeId: 'emp1', severity: 'HIGH', status: 'RESOLVED' })]
    expect(escalateSeverity('LOW', existing, 'emp1')).toBe('LOW')
  })

  it('isHigherSeverity returns correct ordering (HIGH > MEDIUM > LOW)', () => {
    expect(isHigherSeverity('HIGH', 'MEDIUM')).toBe(true)
    expect(isHigherSeverity('MEDIUM', 'LOW')).toBe(true)
    expect(isHigherSeverity('LOW', 'HIGH')).toBe(false)
    expect(isHigherSeverity('MEDIUM', 'MEDIUM')).toBe(false)
  })

  it('getSeverityLevel returns distinct ordered values', () => {
    expect(getSeverityLevel('LOW')).toBeLessThan(getSeverityLevel('MEDIUM'))
    expect(getSeverityLevel('MEDIUM')).toBeLessThan(getSeverityLevel('HIGH'))
  })
})

// ─── Resolution time calculation ──────────────────────────────────────────────

describe('Resolution time calculation', () => {
  it('returns null for OPEN case', () => {
    expect(resolutionTimeHours(baseCase({ status: 'OPEN' }))).toBeNull()
  })

  it('returns null for RESOLVED case without resolvedAt', () => {
    expect(resolutionTimeHours(baseCase({ status: 'RESOLVED', resolvedAt: null }))).toBeNull()
  })

  it('calculates correct hours for a resolved case', () => {
    const g = baseCase({
      status: 'RESOLVED',
      createdAt: '2025-01-10T08:00:00Z',
      resolvedAt: '2025-01-10T20:00:00Z',
    })
    expect(resolutionTimeHours(g)).toBe(12)
  })

  it('averageResolutionTimeHours returns null when no resolved cases', () => {
    const cases = [baseCase({ status: 'OPEN' }), baseCase({ status: 'UNDER_REVIEW' })]
    expect(averageResolutionTimeHours(cases)).toBeNull()
  })

  it('averageResolutionTimeHours correctly averages multiple resolved cases', () => {
    const cases = [
      baseCase({ id: 'g1', status: 'RESOLVED', createdAt: '2025-01-10T08:00:00Z', resolvedAt: '2025-01-10T18:00:00Z' }), // 10h
      baseCase({ id: 'g2', status: 'RESOLVED', createdAt: '2025-01-11T08:00:00Z', resolvedAt: '2025-01-11T22:00:00Z' }), // 14h
    ]
    expect(averageResolutionTimeHours(cases)).toBe(12)
  })
})

// ─── Open case count ──────────────────────────────────────────────────────────

describe('Open case count', () => {
  it('counts OPEN and UNDER_REVIEW as open', () => {
    const cases = [
      baseCase({ id: 'g1', status: 'OPEN' }),
      baseCase({ id: 'g2', status: 'UNDER_REVIEW' }),
      baseCase({ id: 'g3', status: 'RESOLVED' }),
      baseCase({ id: 'g4', status: 'CLOSED' }),
    ]
    expect(countOpenCases(cases)).toBe(2)
  })

  it('returns 0 when all cases are closed or resolved', () => {
    const cases = [
      baseCase({ id: 'g1', status: 'RESOLVED' }),
      baseCase({ id: 'g2', status: 'CLOSED' }),
    ]
    expect(countOpenCases(cases)).toBe(0)
  })
})

// ─── Case summary aggregation ─────────────────────────────────────────────────

describe('Case summary aggregation', () => {
  const mixedCases: Grievance[] = [
    baseCase({ id: 'g1', status: 'OPEN',         severity: 'LOW',    createdAt: '2025-01-10T08:00:00Z' }),
    baseCase({ id: 'g2', status: 'UNDER_REVIEW', severity: 'MEDIUM', createdAt: '2025-01-10T08:00:00Z' }),
    baseCase({ id: 'g3', status: 'RESOLVED',     severity: 'HIGH',   createdAt: '2025-01-10T08:00:00Z', resolvedAt: '2025-01-10T20:00:00Z' }),
    baseCase({ id: 'g4', status: 'CLOSED',       severity: 'HIGH',   createdAt: '2025-01-11T08:00:00Z', resolvedAt: '2025-01-11T16:00:00Z' }),
  ]

  it('buildCaseSummary returns correct totals', () => {
    const summary = buildCaseSummary(mixedCases)
    expect(summary.total).toBe(4)
    expect(summary.open).toBe(1)
    expect(summary.underReview).toBe(1)
    expect(summary.resolved).toBe(1)
    expect(summary.closed).toBe(1)
  })

  it('buildCaseSummary counts high-severity cases correctly', () => {
    const summary = buildCaseSummary(mixedCases)
    expect(summary.highSeverity).toBe(2)
  })

  it('buildCaseSummary computes average resolution time', () => {
    const summary = buildCaseSummary(mixedCases)
    // g3: 12h, g4: 8h → avg 10h
    expect(summary.avgResolutionHours).toBe(10)
  })

  it('countByStatus returns correct breakdown', () => {
    const counts = countByStatus(mixedCases)
    expect(counts.OPEN).toBe(1)
    expect(counts.UNDER_REVIEW).toBe(1)
    expect(counts.RESOLVED).toBe(1)
    expect(counts.CLOSED).toBe(1)
  })

  it('countBySeverity returns correct breakdown', () => {
    const counts = countBySeverity(mixedCases)
    expect(counts.LOW).toBe(1)
    expect(counts.MEDIUM).toBe(1)
    expect(counts.HIGH).toBe(2)
  })
})
