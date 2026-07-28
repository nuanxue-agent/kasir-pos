// Campaign scheduler pure logic — no DB dependencies (safe to import in tests)

export type ScheduledStatus = 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED'
export type TriggerAction = 'SEND_EMAIL' | 'APPLY_DISCOUNT' | 'UPDATE_PRICE'

export interface ScheduledCampaign {
  id: string
  storeId: string
  campaignId: string
  startAt: string
  endAt?: string | null
  status: ScheduledStatus
  autoStart: boolean
  autoStop: boolean
  createdAt: string
  updatedAt: string
}

// ─── Status transitions ────────────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<ScheduledStatus, ScheduledStatus[]> = {
  PENDING:   ['ACTIVE', 'CANCELLED'],
  ACTIVE:    ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
}

export function isValidStatusTransition(
  from: ScheduledStatus,
  to: ScheduledStatus
): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}

// ─── Schedule validation ───────────────────────────────────────────────────────

export interface ScheduleValidationResult {
  valid: boolean
  error?: string
}

export function validateSchedule(
  startAt: string,
  endAt?: string | null
): ScheduleValidationResult {
  const start = new Date(startAt)
  if (isNaN(start.getTime())) {
    return { valid: false, error: 'Invalid startAt date' }
  }

  if (endAt) {
    const end = new Date(endAt)
    if (isNaN(end.getTime())) {
      return { valid: false, error: 'Invalid endAt date' }
    }
    if (start >= end) {
      return { valid: false, error: 'startAt must be before endAt' }
    }
  }

  return { valid: true }
}

// ─── Auto-start trigger detection ─────────────────────────────────────────────

/**
 * Returns true if a PENDING campaign should be auto-started given the current time.
 */
export function shouldAutoStart(campaign: ScheduledCampaign, now = new Date()): boolean {
  if (campaign.status !== 'PENDING') return false
  if (!campaign.autoStart) return false
  const startAt = new Date(campaign.startAt)
  return now >= startAt
}

/**
 * Returns true if an ACTIVE campaign should be auto-stopped given the current time.
 */
export function shouldAutoStop(campaign: ScheduledCampaign, now = new Date()): boolean {
  if (campaign.status !== 'ACTIVE') return false
  if (!campaign.autoStop) return false
  if (!campaign.endAt) return false
  const endAt = new Date(campaign.endAt)
  return now >= endAt
}

// ─── Overlap detection ─────────────────────────────────────────────────────────

/**
 * Returns true if two date ranges overlap.
 * A range with no endAt extends indefinitely.
 */
export function rangesOverlap(
  aStart: string,
  aEnd: string | null | undefined,
  bStart: string,
  bEnd: string | null | undefined
): boolean {
  const aS = new Date(aStart).getTime()
  const aE = aEnd ? new Date(aEnd).getTime() : Infinity
  const bS = new Date(bStart).getTime()
  const bE = bEnd ? new Date(bEnd).getTime() : Infinity

  return aS < bE && bS < aE
}

/**
 * Detects whether a new schedule overlaps with any existing active/pending schedule
 * for the same campaignId.
 */
export function detectOverlap(
  existing: ScheduledCampaign[],
  newStart: string,
  newEnd: string | null | undefined,
  campaignId: string
): ScheduledCampaign | null {
  const active = existing.filter(
    c => c.campaignId === campaignId && (c.status === 'PENDING' || c.status === 'ACTIVE')
  )
  for (const c of active) {
    if (rangesOverlap(c.startAt, c.endAt, newStart, newEnd)) {
      return c
    }
  }
  return null
}

// ─── Trigger action execution (pure — no side effects) ────────────────────────

export interface TriggerResult {
  action: TriggerAction
  success: boolean
  message: string
}

export function buildTriggerResult(action: TriggerAction, campaignId: string): TriggerResult {
  switch (action) {
    case 'SEND_EMAIL':
      return {
        action,
        success: true,
        message: `Email blast queued for campaign ${campaignId}`,
      }
    case 'APPLY_DISCOUNT':
      return {
        action,
        success: true,
        message: `Discount rules activated for campaign ${campaignId}`,
      }
    case 'UPDATE_PRICE':
      return {
        action,
        success: true,
        message: `Product prices updated for campaign ${campaignId}`,
      }
    default:
      return {
        action,
        success: false,
        message: `Unknown trigger action: ${action}`,
      }
  }
}

// ─── Calendar helpers ──────────────────────────────────────────────────────────

/**
 * Returns campaigns active on a given calendar day (YYYY-MM-DD).
 */
export function getCampaignsForDay(
  campaigns: ScheduledCampaign[],
  day: string
): ScheduledCampaign[] {
  const dayStart = new Date(day + 'T00:00:00')
  const dayEnd = new Date(day + 'T23:59:59')

  return campaigns.filter(c => {
    if (c.status === 'CANCELLED') return false
    const start = new Date(c.startAt)
    const end = c.endAt ? new Date(c.endAt) : new Date('9999-12-31')
    return start <= dayEnd && end >= dayStart
  })
}

// ─── Status label helpers ──────────────────────────────────────────────────────

export const STATUS_LABELS: Record<ScheduledStatus, string> = {
  PENDING:   'Menunggu',
  ACTIVE:    'Aktif',
  COMPLETED: 'Selesai',
  CANCELLED: 'Dibatalkan',
}

export const STATUS_COLORS: Record<ScheduledStatus, string> = {
  PENDING:   'bg-amber-50 text-amber-600 border-amber-200',
  ACTIVE:    'bg-emerald-50 text-emerald-600 border-emerald-200',
  COMPLETED: 'bg-[var(--bg-muted)] text-[var(--text-2)]',
  CANCELLED: 'bg-red-50 text-red-500 border-red-200',
}
