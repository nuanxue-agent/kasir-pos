import { describe, it, expect } from 'vitest'

// ── Types ─────────────────────────────────────────────────────────────────────

type LeadStatus = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'PROPOSAL' | 'NEGOTIATION' | 'WON' | 'LOST'

interface Lead {
  id: string
  name: string
  phone?: string
  value: number
  status: LeadStatus
}

// ── Pipeline constants ────────────────────────────────────────────────────────

const STAGE_ORDER: LeadStatus[] = ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'WON', 'LOST']

const VALID_STAGES: LeadStatus[] = [
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'PROPOSAL',
  'NEGOTIATION',
  'WON',
  'LOST',
]

// ── Pure functions (mirrors CRMPageClient exports) ────────────────────────────

function isValidStageTransition(from: LeadStatus, to: LeadStatus): boolean {
  return VALID_STAGES.includes(from) && VALID_STAGES.includes(to) && from !== to
}

function calcFunnelConversion(
  leads: Lead[],
  from: LeadStatus,
  to: LeadStatus,
  stageOrder: LeadStatus[],
): number {
  const fromIdx = stageOrder.indexOf(from)
  const toIdx = stageOrder.indexOf(to)
  if (fromIdx === -1 || toIdx === -1) return 0

  const atFrom = leads.filter(l => {
    const idx = stageOrder.indexOf(l.status as LeadStatus)
    return idx >= fromIdx
  }).length

  if (atFrom === 0) return 0

  const atTo = leads.filter(l => {
    const idx = stageOrder.indexOf(l.status as LeadStatus)
    return idx >= toIdx
  }).length

  return Math.round((atTo / atFrom) * 100)
}

function calcColumnTotalValue(leads: Lead[], stage: LeadStatus): number {
  return leads.filter(l => l.status === stage).reduce((s, l) => s + (l.value ?? 0), 0)
}

function calcFunnelDropOff(
  leads: Lead[],
  from: LeadStatus,
  to: LeadStatus,
  stageOrder: LeadStatus[],
): number {
  return 100 - calcFunnelConversion(leads, from, to, stageOrder)
}

// ── Test fixtures ─────────────────────────────────────────────────────────────

const sampleLeads: Lead[] = [
  { id: '1', name: 'Budi Santoso', phone: '081234567890', value: 5_000_000, status: 'NEW' },
  { id: '2', name: 'Ani Rahayu', phone: '082345678901', value: 3_000_000, status: 'NEW' },
  { id: '3', name: 'Citra Dewi', phone: '083456789012', value: 8_000_000, status: 'CONTACTED' },
  { id: '4', name: 'Dodi Kusuma', phone: '084567890123', value: 2_000_000, status: 'CONTACTED' },
  { id: '5', name: 'Eka Pratama', phone: '085678901234', value: 10_000_000, status: 'CONTACTED' },
  {
    id: '6',
    name: 'Fitri Handayani',
    phone: '086789012345',
    value: 6_000_000,
    status: 'QUALIFIED',
  },
  { id: '7', name: 'Galih Permana', phone: '087890123456', value: 4_000_000, status: 'PROPOSAL' },
  { id: '8', name: 'Hana Wijaya', phone: '088901234567', value: 9_000_000, status: 'WON' },
  { id: '9', name: 'Irfan Maulana', phone: '089012345678', value: 1_000_000, status: 'LOST' },
  { id: '10', name: 'Joko Susilo', phone: '080123456789', value: 7_000_000, status: 'LOST' },
]

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Stage transition validation', () => {
  it('allows moving a lead from NEW to CONTACTED', () => {
    expect(isValidStageTransition('NEW', 'CONTACTED')).toBe(true)
  })

  it('allows moving a lead to terminal stages WON and LOST', () => {
    expect(isValidStageTransition('PROPOSAL', 'WON')).toBe(true)
    expect(isValidStageTransition('QUALIFIED', 'LOST')).toBe(true)
  })

  it('disallows transition from a stage to itself', () => {
    expect(isValidStageTransition('QUALIFIED', 'QUALIFIED')).toBe(false)
    expect(isValidStageTransition('WON', 'WON')).toBe(false)
  })

  it('disallows transitions involving unknown stage values', () => {
    expect(isValidStageTransition('UNKNOWN' as LeadStatus, 'CONTACTED')).toBe(false)
    expect(isValidStageTransition('NEW', 'INVALID' as LeadStatus)).toBe(false)
  })
})

describe('Conversion rate calculation', () => {
  it('calculates Lead → Dihubungi conversion correctly', () => {
    // All 10 leads reached NEW stage (fromIdx=0), 8 reached CONTACTED or beyond
    const pct = calcFunnelConversion(sampleLeads, 'NEW', 'CONTACTED', STAGE_ORDER)
    // atFrom=10, atTo=8 (ids 3-10 are CONTACTED or beyond), = 80%
    expect(pct).toBe(80)
  })

  it('calculates Proposal → Menang (WON) conversion correctly', () => {
    // atFrom = leads at PROPOSAL or beyond = ids 7,8,9,10 = 4
    // atTo   = leads at WON or beyond     = ids 8,9,10   = 3  (WON=idx4, LOST=idx5)
    const pct = calcFunnelConversion(sampleLeads, 'PROPOSAL', 'WON', STAGE_ORDER)
    expect(pct).toBe(75)
  })

  it('returns 0% when no leads exist', () => {
    expect(calcFunnelConversion([], 'NEW', 'CONTACTED', STAGE_ORDER)).toBe(0)
  })

  it('returns 0% for unknown stage in stageOrder', () => {
    expect(calcFunnelConversion(sampleLeads, 'NEGOTIATION' as LeadStatus, 'WON', STAGE_ORDER)).toBe(
      0,
    )
  })
})

describe('Column total value calculation', () => {
  it('sums values for leads in CONTACTED column', () => {
    // ids 3,4,5 are CONTACTED: 8M + 2M + 10M = 20M
    expect(calcColumnTotalValue(sampleLeads, 'CONTACTED')).toBe(20_000_000)
  })

  it('sums values for leads in NEW column', () => {
    // ids 1,2 are NEW: 5M + 3M = 8M
    expect(calcColumnTotalValue(sampleLeads, 'NEW')).toBe(8_000_000)
  })

  it('returns 0 for an empty column', () => {
    expect(calcColumnTotalValue(sampleLeads, 'NEGOTIATION')).toBe(0)
  })

  it('returns 0 for empty leads array', () => {
    expect(calcColumnTotalValue([], 'PROPOSAL')).toBe(0)
  })
})

describe('Funnel drop-off percentage', () => {
  it('calculates drop-off as complement of conversion rate', () => {
    const pct = calcFunnelConversion(sampleLeads, 'NEW', 'CONTACTED', STAGE_ORDER)
    const dropOff = calcFunnelDropOff(sampleLeads, 'NEW', 'CONTACTED', STAGE_ORDER)
    expect(pct + dropOff).toBe(100)
  })

  it('returns 100% drop-off when no leads pass the stage', () => {
    const noPassLeads: Lead[] = [
      { id: '1', name: 'A', value: 1000, status: 'NEW' },
      { id: '2', name: 'B', value: 2000, status: 'NEW' },
    ]
    const dropOff = calcFunnelDropOff(noPassLeads, 'NEW', 'CONTACTED', STAGE_ORDER)
    expect(dropOff).toBe(100)
  })

  it('returns 0% drop-off when all leads advance', () => {
    const allAdvance: Lead[] = [
      { id: '1', name: 'A', value: 1000, status: 'CONTACTED' },
      { id: '2', name: 'B', value: 2000, status: 'WON' },
    ]
    // atFrom (CONTACTED or beyond) = 2, atTo (CONTACTED or beyond) = 2 → 100% conversion → 0% drop-off
    const dropOff = calcFunnelDropOff(allAdvance, 'NEW', 'CONTACTED', STAGE_ORDER)
    expect(dropOff).toBe(0)
  })
})
