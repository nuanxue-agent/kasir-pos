import { describe, it, expect } from 'vitest'

// ── CRM business logic ────────────────────────────────────────────────────────

type LeadStatus = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'PROPOSAL' | 'NEGOTIATION' | 'WON' | 'LOST'
type LeadPriority = 'LOW' | 'MEDIUM' | 'HIGH'
type ActivityType = 'CALL' | 'EMAIL' | 'MEETING' | 'NOTE' | 'FOLLOW_UP'

interface Lead {
  id: string
  name: string
  company?: string
  email?: string
  phone?: string
  status: LeadStatus
  priority: LeadPriority
  value: number
  probability: number
  createdAt: string
  expectedCloseDate?: string
}

interface Activity {
  id: string
  leadId: string
  type: ActivityType
  title: string
  note?: string
  dueDate?: string
  completedAt?: string
}

// ── Pure functions ─────────────────────────────────────────────────────────────

const PIPELINE_ORDER: LeadStatus[] = ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST']

function getStageIndex(status: LeadStatus): number {
  return PIPELINE_ORDER.indexOf(status)
}

function canAdvanceStage(status: LeadStatus): boolean {
  return status !== 'WON' && status !== 'LOST'
}

function nextStage(status: LeadStatus): LeadStatus | null {
  const idx = getStageIndex(status)
  if (idx === -1 || idx >= PIPELINE_ORDER.indexOf('NEGOTIATION')) return null
  return PIPELINE_ORDER[idx + 1]
}

function calcWeightedValue(value: number, probability: number): number {
  return Math.round(value * (probability / 100))
}

function calcPipelineValue(leads: Lead[]): number {
  return leads
    .filter(l => l.status !== 'LOST')
    .reduce((s, l) => s + l.value, 0)
}

function calcWeightedPipelineValue(leads: Lead[]): number {
  return leads
    .filter(l => l.status !== 'LOST')
    .reduce((s, l) => s + calcWeightedValue(l.value, l.probability), 0)
}

function calcConversionRate(leads: Lead[]): number {
  const total = leads.filter(l => l.status === 'WON' || l.status === 'LOST').length
  if (total === 0) return 0
  const won = leads.filter(l => l.status === 'WON').length
  return Math.round((won / total) * 100)
}

function getLeadsByStage(leads: Lead[]): Record<LeadStatus, Lead[]> {
  const result = {} as Record<LeadStatus, Lead[]>
  for (const s of PIPELINE_ORDER) result[s] = []
  for (const l of leads) result[l.status].push(l)
  return result
}

function isOverdue(lead: Lead, asOf: string = new Date().toISOString().slice(0, 10)): boolean {
  if (!lead.expectedCloseDate) return false
  if (lead.status === 'WON' || lead.status === 'LOST') return false
  return lead.expectedCloseDate < asOf
}

function isActivityOverdue(activity: Activity, asOf: string = new Date().toISOString().slice(0, 10)): boolean {
  if (activity.completedAt) return false
  if (!activity.dueDate) return false
  return activity.dueDate < asOf
}

function validateLead(data: any): string | null {
  if (!data.name || data.name.trim().length < 2) return 'Nama lead minimal 2 karakter'
  if (data.email && !data.email.includes('@')) return 'Email tidak valid'
  if (data.value != null && data.value < 0) return 'Nilai tidak boleh negatif'
  if (data.probability != null && (data.probability < 0 || data.probability > 100)) return 'Probabilitas harus 0-100'
  return null
}

function getDefaultProbability(status: LeadStatus): number {
  const map: Record<LeadStatus, number> = {
    NEW: 10, CONTACTED: 20, QUALIFIED: 40,
    PROPOSAL: 60, NEGOTIATION: 80, WON: 100, LOST: 0,
  }
  return map[status]
}

function sortLeadsByPriority(leads: Lead[]): Lead[] {
  const order: Record<LeadPriority, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 }
  return [...leads].sort((a, b) => order[a.priority] - order[b.priority])
}

function getFollowUpsDue(activities: Activity[], asOf: string): Activity[] {
  return activities.filter(a =>
    !a.completedAt &&
    a.type === 'FOLLOW_UP' &&
    a.dueDate &&
    a.dueDate <= asOf
  )
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Pipeline stage management', () => {
  it('returns correct stage index', () => {
    expect(getStageIndex('NEW')).toBe(0)
    expect(getStageIndex('WON')).toBe(5)
    expect(getStageIndex('LOST')).toBe(6)
  })

  it('returns -1 for unknown status', () => {
    expect(getStageIndex('UNKNOWN' as any)).toBe(-1)
  })

  it('can advance from active stages', () => {
    const activeStages: LeadStatus[] = ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL']
    activeStages.forEach(s => expect(canAdvanceStage(s)).toBe(true))
  })

  it('cannot advance from terminal stages', () => {
    expect(canAdvanceStage('WON')).toBe(false)
    expect(canAdvanceStage('LOST')).toBe(false)
  })

  it('advances to next stage', () => {
    expect(nextStage('NEW')).toBe('CONTACTED')
    expect(nextStage('CONTACTED')).toBe('QUALIFIED')
    expect(nextStage('QUALIFIED')).toBe('PROPOSAL')
    expect(nextStage('PROPOSAL')).toBe('NEGOTIATION')
  })

  it('returns null from NEGOTIATION and beyond', () => {
    expect(nextStage('NEGOTIATION')).toBeNull()
    expect(nextStage('WON')).toBeNull()
    expect(nextStage('LOST')).toBeNull()
  })
})

describe('Deal value calculations', () => {
  it('calculates weighted value', () => {
    expect(calcWeightedValue(10_000_000, 80)).toBe(8_000_000)
    expect(calcWeightedValue(5_000_000, 50)).toBe(2_500_000)
    expect(calcWeightedValue(1_000_000, 0)).toBe(0)
    expect(calcWeightedValue(1_000_000, 100)).toBe(1_000_000)
  })

  const leads: Lead[] = [
    { id: '1', name: 'A', status: 'QUALIFIED', priority: 'HIGH', value: 5_000_000, probability: 40, createdAt: '2025-01-01' },
    { id: '2', name: 'B', status: 'WON', priority: 'HIGH', value: 3_000_000, probability: 100, createdAt: '2025-01-01' },
    { id: '3', name: 'C', status: 'LOST', priority: 'LOW', value: 2_000_000, probability: 0, createdAt: '2025-01-01' },
  ]

  it('calculates total pipeline value (excludes LOST)', () => {
    expect(calcPipelineValue(leads)).toBe(8_000_000)
  })

  it('calculates weighted pipeline value', () => {
    // A: 5M * 40% = 2M, B: 3M * 100% = 3M, LOST excluded
    expect(calcWeightedPipelineValue(leads)).toBe(5_000_000)
  })

  it('returns 0 for empty pipeline', () => {
    expect(calcPipelineValue([])).toBe(0)
    expect(calcWeightedPipelineValue([])).toBe(0)
  })
})

describe('Conversion rate', () => {
  it('calculates win rate correctly', () => {
    const leads: Lead[] = [
      { id: '1', name: 'A', status: 'WON', priority: 'HIGH', value: 1000, probability: 100, createdAt: '2025-01-01' },
      { id: '2', name: 'B', status: 'WON', priority: 'HIGH', value: 1000, probability: 100, createdAt: '2025-01-01' },
      { id: '3', name: 'C', status: 'LOST', priority: 'LOW', value: 1000, probability: 0, createdAt: '2025-01-01' },
      { id: '4', name: 'D', status: 'LOST', priority: 'LOW', value: 1000, probability: 0, createdAt: '2025-01-01' },
    ]
    expect(calcConversionRate(leads)).toBe(50)
  })

  it('returns 0 when no closed deals', () => {
    const leads: Lead[] = [
      { id: '1', name: 'A', status: 'NEW', priority: 'LOW', value: 1000, probability: 10, createdAt: '2025-01-01' },
    ]
    expect(calcConversionRate(leads)).toBe(0)
  })

  it('returns 100 when all won', () => {
    const leads: Lead[] = [
      { id: '1', name: 'A', status: 'WON', priority: 'HIGH', value: 1000, probability: 100, createdAt: '2025-01-01' },
    ]
    expect(calcConversionRate(leads)).toBe(100)
  })
})

describe('Leads by stage', () => {
  it('groups leads into correct stages', () => {
    const leads: Lead[] = [
      { id: '1', name: 'A', status: 'NEW', priority: 'HIGH', value: 0, probability: 10, createdAt: '2025-01-01' },
      { id: '2', name: 'B', status: 'NEW', priority: 'LOW', value: 0, probability: 10, createdAt: '2025-01-01' },
      { id: '3', name: 'C', status: 'WON', priority: 'HIGH', value: 0, probability: 100, createdAt: '2025-01-01' },
    ]
    const grouped = getLeadsByStage(leads)
    expect(grouped.NEW).toHaveLength(2)
    expect(grouped.WON).toHaveLength(1)
    expect(grouped.LOST).toHaveLength(0)
    expect(grouped.QUALIFIED).toHaveLength(0)
  })

  it('all stages are present even when empty', () => {
    const grouped = getLeadsByStage([])
    for (const s of PIPELINE_ORDER) {
      expect(grouped[s]).toBeDefined()
      expect(grouped[s]).toHaveLength(0)
    }
  })
})

describe('Overdue detection', () => {
  it('detects overdue lead', () => {
    const lead: Lead = { id: '1', name: 'A', status: 'QUALIFIED', priority: 'HIGH', value: 0, probability: 40, createdAt: '2025-01-01', expectedCloseDate: '2025-01-01' }
    expect(isOverdue(lead, '2025-06-01')).toBe(true)
  })

  it('not overdue for future date', () => {
    const lead: Lead = { id: '1', name: 'A', status: 'QUALIFIED', priority: 'HIGH', value: 0, probability: 40, createdAt: '2025-01-01', expectedCloseDate: '2025-12-31' }
    expect(isOverdue(lead, '2025-06-01')).toBe(false)
  })

  it('not overdue if no expected date', () => {
    const lead: Lead = { id: '1', name: 'A', status: 'QUALIFIED', priority: 'HIGH', value: 0, probability: 40, createdAt: '2025-01-01' }
    expect(isOverdue(lead, '2025-06-01')).toBe(false)
  })

  it('not overdue if WON or LOST', () => {
    const won: Lead = { id: '1', name: 'A', status: 'WON', priority: 'HIGH', value: 0, probability: 100, createdAt: '2025-01-01', expectedCloseDate: '2025-01-01' }
    const lost: Lead = { id: '2', name: 'B', status: 'LOST', priority: 'LOW', value: 0, probability: 0, createdAt: '2025-01-01', expectedCloseDate: '2025-01-01' }
    expect(isOverdue(won, '2025-06-01')).toBe(false)
    expect(isOverdue(lost, '2025-06-01')).toBe(false)
  })
})

describe('Lead validation', () => {
  it('accepts valid lead', () => {
    expect(validateLead({ name: 'PT Maju Jaya', email: 'info@maju.com', value: 5000000, probability: 60 })).toBeNull()
  })
  it('rejects short name', () => {
    expect(validateLead({ name: 'A' })).toBe('Nama lead minimal 2 karakter')
  })
  it('rejects invalid email', () => {
    expect(validateLead({ name: 'PT Maju', email: 'notanemail' })).toBe('Email tidak valid')
  })
  it('rejects negative value', () => {
    expect(validateLead({ name: 'PT Maju', value: -1000 })).toBe('Nilai tidak boleh negatif')
  })
  it('rejects probability > 100', () => {
    expect(validateLead({ name: 'PT Maju', probability: 110 })).toBe('Probabilitas harus 0-100')
  })
  it('rejects probability < 0', () => {
    expect(validateLead({ name: 'PT Maju', probability: -5 })).toBe('Probabilitas harus 0-100')
  })
})

describe('Default probability by stage', () => {
  it('returns correct defaults', () => {
    expect(getDefaultProbability('NEW')).toBe(10)
    expect(getDefaultProbability('CONTACTED')).toBe(20)
    expect(getDefaultProbability('QUALIFIED')).toBe(40)
    expect(getDefaultProbability('PROPOSAL')).toBe(60)
    expect(getDefaultProbability('NEGOTIATION')).toBe(80)
    expect(getDefaultProbability('WON')).toBe(100)
    expect(getDefaultProbability('LOST')).toBe(0)
  })
})

describe('Sort leads by priority', () => {
  it('sorts HIGH → MEDIUM → LOW', () => {
    const leads: Lead[] = [
      { id: '1', name: 'Low', status: 'NEW', priority: 'LOW', value: 0, probability: 10, createdAt: '2025-01-01' },
      { id: '2', name: 'High', status: 'NEW', priority: 'HIGH', value: 0, probability: 10, createdAt: '2025-01-01' },
      { id: '3', name: 'Med', status: 'NEW', priority: 'MEDIUM', value: 0, probability: 10, createdAt: '2025-01-01' },
    ]
    const sorted = sortLeadsByPriority(leads)
    expect(sorted[0].priority).toBe('HIGH')
    expect(sorted[1].priority).toBe('MEDIUM')
    expect(sorted[2].priority).toBe('LOW')
  })
})

describe('Follow-up activities', () => {
  const activities: Activity[] = [
    { id: '1', leadId: 'l1', type: 'FOLLOW_UP', title: 'Call', dueDate: '2025-06-01' },
    { id: '2', leadId: 'l1', type: 'FOLLOW_UP', title: 'Email', dueDate: '2025-07-01' },
    { id: '3', leadId: 'l1', type: 'NOTE', title: 'Note', dueDate: '2025-06-01' },
    { id: '4', leadId: 'l1', type: 'FOLLOW_UP', title: 'Done', dueDate: '2025-06-01', completedAt: '2025-06-01T10:00:00Z' },
  ]

  it('returns overdue follow-ups', () => {
    const due = getFollowUpsDue(activities, '2025-06-15')
    expect(due).toHaveLength(1)
    expect(due[0].id).toBe('1')
  })

  it('excludes completed activities', () => {
    const due = getFollowUpsDue(activities, '2025-12-31')
    expect(due.find(a => a.id === '4')).toBeUndefined()
  })

  it('excludes non-FOLLOW_UP types', () => {
    const due = getFollowUpsDue(activities, '2025-12-31')
    expect(due.every(a => a.type === 'FOLLOW_UP')).toBe(true)
  })
})
