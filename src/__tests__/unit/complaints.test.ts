import { describe, it, expect } from 'vitest'

// ─── Types ───────────────────────────────────────────────────────────────────

type ComplaintCategory = 'PRODUCT_QUALITY' | 'SERVICE' | 'DELIVERY' | 'BILLING' | 'OTHER'
type ComplaintPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
type ComplaintStatus = 'NEW' | 'ASSIGNED' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'

interface Complaint {
  id: string
  storeId: string
  customerId: string | null
  customerName: string | null
  orderId: string | null
  category: ComplaintCategory
  description: string
  priority: ComplaintPriority
  status: ComplaintStatus
  assignedTo: string | null
  createdAt: string
  resolvedAt: string | null
  resolution: string | null
}

// ─── Pure business logic (mirrors API + client logic) ─────────────────────────

const ALLOWED_TRANSITIONS: Record<ComplaintStatus, ComplaintStatus[]> = {
  NEW:         ['ASSIGNED', 'IN_PROGRESS', 'CLOSED'],
  ASSIGNED:    ['IN_PROGRESS', 'RESOLVED', 'CLOSED'],
  IN_PROGRESS: ['RESOLVED', 'CLOSED'],
  RESOLVED:    ['CLOSED'],
  CLOSED:      [],
}

export function isValidTransition(from: ComplaintStatus, to: ComplaintStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to)
}

export function calcResolutionHours(createdAt: string, resolvedAt: string | null): number | null {
  if (!resolvedAt) return null
  const diff = new Date(resolvedAt).getTime() - new Date(createdAt).getTime()
  return diff / (1000 * 60 * 60)
}

export function isSlaBreached(createdAt: string, resolvedAt: string | null, targetHours: number): boolean {
  const hours = calcResolutionHours(createdAt, resolvedAt ?? new Date().toISOString())
  if (hours === null) return false
  return hours > targetHours
}

export function getSlaTargetHours(priority: ComplaintPriority): number {
  const targets: Record<ComplaintPriority, number> = {
    URGENT: 4,
    HIGH: 24,
    MEDIUM: 72,
    LOW: 168,
  }
  return targets[priority]
}

export function shouldEscalatePriority(
  complaint: Complaint,
  currentTime: Date = new Date(),
): ComplaintPriority {
  const hoursOpen = (currentTime.getTime() - new Date(complaint.createdAt).getTime()) / (1000 * 60 * 60)
  const target = getSlaTargetHours(complaint.priority)

  if (complaint.priority === 'LOW' && hoursOpen > target * 0.9) return 'MEDIUM'
  if (complaint.priority === 'MEDIUM' && hoursOpen > target * 0.9) return 'HIGH'
  if (complaint.priority === 'HIGH' && hoursOpen > target * 0.9) return 'URGENT'
  return complaint.priority
}

export function calcResolutionRate(complaints: Complaint[]): number {
  if (complaints.length === 0) return 0
  const resolved = complaints.filter(
    (c) => c.status === 'RESOLVED' || c.status === 'CLOSED',
  ).length
  return Math.round((resolved / complaints.length) * 100)
}

export function calcAvgResolutionHours(complaints: Complaint[]): number | null {
  const resolved = complaints.filter((c) => c.resolvedAt !== null)
  if (resolved.length === 0) return null
  const total = resolved.reduce((sum, c) => {
    const h = calcResolutionHours(c.createdAt, c.resolvedAt)
    return sum + (h ?? 0)
  }, 0)
  return total / resolved.length
}

export function getCategoryBreakdown(complaints: Complaint[]): Record<ComplaintCategory, number> {
  const result: Record<ComplaintCategory, number> = {
    PRODUCT_QUALITY: 0,
    SERVICE: 0,
    DELIVERY: 0,
    BILLING: 0,
    OTHER: 0,
  }
  for (const c of complaints) {
    result[c.category]++
  }
  return result
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeComplaint(overrides: Partial<Complaint> = {}): Complaint {
  return {
    id: 'c1',
    storeId: 's1',
    customerId: null,
    customerName: 'Budi',
    orderId: null,
    category: 'SERVICE',
    description: 'Staff was rude',
    priority: 'MEDIUM',
    status: 'NEW',
    assignedTo: null,
    createdAt: new Date('2024-01-01T08:00:00Z').toISOString(),
    resolvedAt: null,
    resolution: null,
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Complaint Module', () => {

  describe('SLA calculation', () => {
    it('should return null when complaint is not resolved', () => {
      const c = makeComplaint({ resolvedAt: null })
      expect(calcResolutionHours(c.createdAt, c.resolvedAt)).toBeNull()
    })

    it('should calculate resolution time in hours correctly', () => {
      const created = new Date('2024-01-01T08:00:00Z').toISOString()
      const resolved = new Date('2024-01-01T20:00:00Z').toISOString()
      expect(calcResolutionHours(created, resolved)).toBe(12)
    })

    it('should detect SLA breach when resolution time exceeds target', () => {
      const created = new Date('2024-01-01T08:00:00Z').toISOString()
      const resolved = new Date('2024-01-03T10:00:00Z').toISOString() // 50h > 72h? No — HIGH = 24h
      expect(isSlaBreached(created, resolved, 24)).toBe(true)
    })

    it('should return false for SLA within target', () => {
      const created = new Date('2024-01-01T08:00:00Z').toISOString()
      const resolved = new Date('2024-01-01T18:00:00Z').toISOString() // 10h < 24h
      expect(isSlaBreached(created, resolved, 24)).toBe(false)
    })

    it('should return correct SLA targets per priority', () => {
      expect(getSlaTargetHours('URGENT')).toBe(4)
      expect(getSlaTargetHours('HIGH')).toBe(24)
      expect(getSlaTargetHours('MEDIUM')).toBe(72)
      expect(getSlaTargetHours('LOW')).toBe(168)
    })
  })

  describe('Status transition validation', () => {
    it('should allow valid transition from NEW to ASSIGNED', () => {
      expect(isValidTransition('NEW', 'ASSIGNED')).toBe(true)
    })

    it('should allow valid transition from IN_PROGRESS to RESOLVED', () => {
      expect(isValidTransition('IN_PROGRESS', 'RESOLVED')).toBe(true)
    })

    it('should reject invalid transition from RESOLVED to NEW', () => {
      expect(isValidTransition('RESOLVED', 'NEW')).toBe(false)
    })

    it('should reject any transition from CLOSED', () => {
      expect(isValidTransition('CLOSED', 'RESOLVED')).toBe(false)
      expect(isValidTransition('CLOSED', 'NEW')).toBe(false)
    })
  })

  describe('Priority escalation', () => {
    it('should escalate LOW to MEDIUM when 90% of SLA elapsed', () => {
      const lowSla = getSlaTargetHours('LOW') // 168h
      const elapsed = lowSla * 0.95
      const createdAt = new Date(Date.now() - elapsed * 60 * 60 * 1000).toISOString()
      const c = makeComplaint({ priority: 'LOW', createdAt })
      expect(shouldEscalatePriority(c)).toBe('MEDIUM')
    })

    it('should not escalate when well within SLA window', () => {
      const createdAt = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString() // 1h ago
      const c = makeComplaint({ priority: 'MEDIUM', createdAt })
      expect(shouldEscalatePriority(c)).toBe('MEDIUM')
    })
  })

  describe('Category breakdown', () => {
    it('should count complaints by category', () => {
      const complaints = [
        makeComplaint({ id: 'c1', category: 'SERVICE' }),
        makeComplaint({ id: 'c2', category: 'SERVICE' }),
        makeComplaint({ id: 'c3', category: 'BILLING' }),
        makeComplaint({ id: 'c4', category: 'PRODUCT_QUALITY' }),
      ]
      const breakdown = getCategoryBreakdown(complaints)
      expect(breakdown.SERVICE).toBe(2)
      expect(breakdown.BILLING).toBe(1)
      expect(breakdown.PRODUCT_QUALITY).toBe(1)
      expect(breakdown.DELIVERY).toBe(0)
      expect(breakdown.OTHER).toBe(0)
    })
  })

  describe('Resolution rate', () => {
    it('should return 0 for empty complaint list', () => {
      expect(calcResolutionRate([])).toBe(0)
    })

    it('should calculate resolution rate correctly', () => {
      const complaints = [
        makeComplaint({ id: 'c1', status: 'RESOLVED' }),
        makeComplaint({ id: 'c2', status: 'RESOLVED' }),
        makeComplaint({ id: 'c3', status: 'CLOSED' }),
        makeComplaint({ id: 'c4', status: 'NEW' }),
      ]
      expect(calcResolutionRate(complaints)).toBe(75)
    })

    it('should calculate average resolution hours', () => {
      const base = new Date('2024-01-01T00:00:00Z').toISOString()
      const complaints = [
        makeComplaint({
          id: 'c1',
          createdAt: base,
          resolvedAt: new Date('2024-01-01T10:00:00Z').toISOString(), // 10h
          status: 'RESOLVED',
        }),
        makeComplaint({
          id: 'c2',
          createdAt: base,
          resolvedAt: new Date('2024-01-01T20:00:00Z').toISOString(), // 20h
          status: 'RESOLVED',
        }),
      ]
      expect(calcAvgResolutionHours(complaints)).toBe(15)
    })
  })
})
