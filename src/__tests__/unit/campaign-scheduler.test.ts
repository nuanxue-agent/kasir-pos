import { describe, it, expect } from 'vitest'
import {
  validateSchedule,
  shouldAutoStart,
  shouldAutoStop,
  isValidStatusTransition,
  detectOverlap,
  rangesOverlap,
  buildTriggerResult,
  getCampaignsForDay,
  type ScheduledCampaign,
} from '@/lib/campaign-scheduler'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeCampaign(overrides: Partial<ScheduledCampaign> = {}): ScheduledCampaign {
  return {
    id: 'sc1',
    storeId: 'store1',
    campaignId: 'PROMO-01',
    startAt: '2026-08-01T08:00:00.000Z',
    endAt: '2026-08-31T23:59:59.000Z',
    status: 'PENDING',
    autoStart: true,
    autoStop: true,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  }
}

// ─── 1. Schedule validation: start < end ──────────────────────────────────────

describe('validateSchedule', () => {
  it('accepts valid start and end dates', () => {
    const result = validateSchedule('2026-08-01T08:00:00Z', '2026-08-31T23:59:59Z')
    expect(result.valid).toBe(true)
    expect(result.error).toBeUndefined()
  })

  it('rejects when startAt equals endAt', () => {
    const result = validateSchedule('2026-08-01T08:00:00Z', '2026-08-01T08:00:00Z')
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/before/)
  })

  it('rejects when startAt is after endAt', () => {
    const result = validateSchedule('2026-09-01T00:00:00Z', '2026-08-01T00:00:00Z')
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/before/)
  })

  it('accepts valid startAt with no endAt (open-ended campaign)', () => {
    const result = validateSchedule('2026-08-01T08:00:00Z', null)
    expect(result.valid).toBe(true)
  })
})

// ─── 2. Auto-start trigger detection ──────────────────────────────────────────

describe('shouldAutoStart', () => {
  it('returns true when PENDING, autoStart=true, and now >= startAt', () => {
    const campaign = makeCampaign({ startAt: '2026-07-01T00:00:00Z' }) // in the past
    const result = shouldAutoStart(campaign, new Date('2026-07-28T12:00:00Z'))
    expect(result).toBe(true)
  })

  it('returns false when PENDING but now < startAt (not yet time)', () => {
    const campaign = makeCampaign({ startAt: '2026-12-01T00:00:00Z' })
    const result = shouldAutoStart(campaign, new Date('2026-07-28T12:00:00Z'))
    expect(result).toBe(false)
  })

  it('returns false when autoStart is false even if time has passed', () => {
    const campaign = makeCampaign({ startAt: '2026-07-01T00:00:00Z', autoStart: false })
    const result = shouldAutoStart(campaign, new Date('2026-07-28T12:00:00Z'))
    expect(result).toBe(false)
  })
})

// ─── 3. Campaign status transitions ───────────────────────────────────────────

describe('isValidStatusTransition', () => {
  it('allows PENDING → ACTIVE', () => {
    expect(isValidStatusTransition('PENDING', 'ACTIVE')).toBe(true)
  })

  it('allows ACTIVE → COMPLETED', () => {
    expect(isValidStatusTransition('ACTIVE', 'COMPLETED')).toBe(true)
  })

  it('allows ACTIVE → CANCELLED', () => {
    expect(isValidStatusTransition('ACTIVE', 'CANCELLED')).toBe(true)
  })

  it('rejects COMPLETED → ACTIVE (no going back)', () => {
    expect(isValidStatusTransition('COMPLETED', 'ACTIVE')).toBe(false)
  })

  it('rejects CANCELLED → PENDING (cancelled is terminal)', () => {
    expect(isValidStatusTransition('CANCELLED', 'PENDING')).toBe(false)
  })
})

// ─── 4. Overlap detection ─────────────────────────────────────────────────────

describe('detectOverlap', () => {
  it('detects overlap when new schedule falls within existing range', () => {
    const existing = [makeCampaign({ startAt: '2026-08-01T00:00:00Z', endAt: '2026-08-31T23:59:59Z', status: 'PENDING' })]
    const conflict = detectOverlap(existing, '2026-08-15T00:00:00Z', '2026-08-20T00:00:00Z', 'PROMO-01')
    expect(conflict).not.toBeNull()
    expect(conflict?.id).toBe('sc1')
  })

  it('returns null when schedules do not overlap', () => {
    const existing = [makeCampaign({ startAt: '2026-07-01T00:00:00Z', endAt: '2026-07-31T23:59:59Z', status: 'PENDING' })]
    const conflict = detectOverlap(existing, '2026-08-01T00:00:00Z', '2026-08-31T00:00:00Z', 'PROMO-01')
    expect(conflict).toBeNull()
  })

  it('returns null when overlap is with a different campaignId', () => {
    const existing = [makeCampaign({ campaignId: 'PROMO-99', startAt: '2026-08-01T00:00:00Z', endAt: '2026-08-31T00:00:00Z' })]
    const conflict = detectOverlap(existing, '2026-08-15T00:00:00Z', '2026-08-20T00:00:00Z', 'PROMO-01')
    expect(conflict).toBeNull()
  })
})

// ─── 5. Trigger action execution ──────────────────────────────────────────────

describe('buildTriggerResult', () => {
  it('returns success result for SEND_EMAIL action', () => {
    const result = buildTriggerResult('SEND_EMAIL', 'PROMO-01')
    expect(result.action).toBe('SEND_EMAIL')
    expect(result.success).toBe(true)
    expect(result.message).toContain('PROMO-01')
  })

  it('returns success result for APPLY_DISCOUNT action', () => {
    const result = buildTriggerResult('APPLY_DISCOUNT', 'SUMMER-SALE')
    expect(result.action).toBe('APPLY_DISCOUNT')
    expect(result.success).toBe(true)
  })

  it('returns success result for UPDATE_PRICE action', () => {
    const result = buildTriggerResult('UPDATE_PRICE', 'FLASH-01')
    expect(result.action).toBe('UPDATE_PRICE')
    expect(result.success).toBe(true)
    expect(result.message).toContain('FLASH-01')
  })
})

// ─── 6. Calendar helper ───────────────────────────────────────────────────────

describe('getCampaignsForDay', () => {
  it('returns campaigns active on the given day', () => {
    const campaigns = [
      makeCampaign({ startAt: '2026-08-01T00:00:00Z', endAt: '2026-08-31T23:59:59Z', status: 'ACTIVE' }),
    ]
    const result = getCampaignsForDay(campaigns, '2026-08-15')
    expect(result).toHaveLength(1)
  })

  it('excludes cancelled campaigns from calendar', () => {
    const campaigns = [
      makeCampaign({ startAt: '2026-08-01T00:00:00Z', endAt: '2026-08-31T23:59:59Z', status: 'CANCELLED' }),
    ]
    const result = getCampaignsForDay(campaigns, '2026-08-15')
    expect(result).toHaveLength(0)
  })
})
