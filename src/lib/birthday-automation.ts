// Pure business logic for birthday/anniversary automation
// No DB or Next.js imports — all functions are unit-testable

export type TriggerType = 'BIRTHDAY' | 'ANNIVERSARY' | 'SIGNUP_ANNIVERSARY'
export type RewardType = 'VOUCHER' | 'POINTS' | 'DISCOUNT'
export type QueueStatus = 'PENDING' | 'SENT' | 'FAILED'

export interface BirthdayAutomation {
  id: string
  storeId: string
  triggerType: TriggerType
  daysBeforeTrigger: number
  rewardType: RewardType
  rewardValue: number
  message: string
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface BirthdayQueue {
  id: string
  customerId: string
  storeId: string
  automationId: string
  scheduledDate: string
  status: QueueStatus
  sentAt: string | null
}

export interface CustomerBirthday {
  customerId: string
  name: string
  phone?: string
  birthday?: string | null       // ISO date string (YYYY-MM-DD or full ISO)
  anniversaryDate?: string | null // first purchase date
  signupDate?: string | null
}

/**
 * Returns the number of days until the next occurrence of a month/day
 * from a reference date. Returns 0 if today, negative if already passed this year.
 */
export function daysUntilNextBirthday(birthdayISO: string, from = new Date()): number {
  const bd = new Date(birthdayISO)
  const thisYear = new Date(from.getFullYear(), bd.getMonth(), bd.getDate())
  const diffMs = thisYear.getTime() - new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime()
  const diffDays = Math.round(diffMs / 86_400_000)
  if (diffDays >= 0) return diffDays
  // Already passed this year — count to next year
  const nextYear = new Date(from.getFullYear() + 1, bd.getMonth(), bd.getDate())
  return Math.round(
    (nextYear.getTime() - new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime()) / 86_400_000,
  )
}

/**
 * Given a trigger date (birthday/anniversary) and daysBeforeTrigger,
 * return the ISO date (YYYY-MM-DD) when a reward should be sent.
 */
export function calcTriggerDate(eventDateISO: string, daysBeforeTrigger: number, fromYear: number): string {
  // Parse month/day from ISO string directly to avoid UTC→local timezone shift
  const [, mm, dd] = eventDateISO.split('-').map(Number)
  // Build a UTC date for the event in fromYear, then subtract daysBeforeTrigger
  const eventMs = Date.UTC(fromYear, mm - 1, dd) - daysBeforeTrigger * 86_400_000
  const d = new Date(eventMs)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Returns true if the customer has a birthday/anniversary within the next `windowDays` days.
 */
export function isUpcomingBirthday(
  customer: CustomerBirthday,
  triggerType: TriggerType,
  windowDays = 30,
  from = new Date(),
): boolean {
  const dateISO =
    triggerType === 'BIRTHDAY'
      ? customer.birthday
      : triggerType === 'ANNIVERSARY'
      ? customer.anniversaryDate
      : customer.signupDate

  if (!dateISO) return false
  const days = daysUntilNextBirthday(dateISO, from)
  return days >= 0 && days <= windowDays
}

/**
 * Calculate the actual reward value given rewardType.
 * VOUCHER → fixed IDR amount
 * POINTS  → fixed points
 * DISCOUNT → percentage (0–100)
 */
export function calcRewardValue(
  rewardType: RewardType,
  rewardValue: number,
  purchaseAmount = 0,
): number {
  if (rewardType === 'VOUCHER') return rewardValue
  if (rewardType === 'POINTS') return rewardValue
  if (rewardType === 'DISCOUNT') {
    if (purchaseAmount <= 0) return 0
    return Math.round((rewardValue / 100) * purchaseAmount)
  }
  return 0
}

/**
 * Queue status transition guard.
 * PENDING → SENT | FAILED
 * FAILED  → PENDING (retry)
 * SENT    → terminal
 */
const QUEUE_TRANSITIONS: Record<QueueStatus, QueueStatus[]> = {
  PENDING: ['SENT', 'FAILED'],
  FAILED: ['PENDING'],
  SENT: [],
}

export function isValidQueueTransition(from: QueueStatus, to: QueueStatus): boolean {
  return QUEUE_TRANSITIONS[from]?.includes(to) ?? false
}

/**
 * Returns a list of customers whose birthday/anniversary falls within the next `windowDays` days,
 * sorted by days until event (ascending).
 */
export function getUpcomingCustomers(
  customers: CustomerBirthday[],
  triggerType: TriggerType,
  windowDays = 30,
  from = new Date(),
): Array<CustomerBirthday & { daysUntil: number }> {
  return customers
    .map(c => {
      const dateISO =
        triggerType === 'BIRTHDAY'
          ? c.birthday
          : triggerType === 'ANNIVERSARY'
          ? c.anniversaryDate
          : c.signupDate
      if (!dateISO) return null
      const days = daysUntilNextBirthday(dateISO, from)
      if (days < 0 || days > windowDays) return null
      return { ...c, daysUntil: days }
    })
    .filter((x): x is CustomerBirthday & { daysUntil: number } => x !== null)
    .sort((a, b) => a.daysUntil - b.daysUntil)
}

/**
 * Format a trigger date label for display (e.g. "3 hari sebelum ulang tahun")
 */
export function formatTriggerLabel(triggerType: TriggerType, daysBeforeTrigger: number): string {
  const eventLabel =
    triggerType === 'BIRTHDAY'
      ? 'ulang tahun'
      : triggerType === 'ANNIVERSARY'
      ? 'anniversary pembelian'
      : 'anniversary pendaftaran'
  if (daysBeforeTrigger === 0) return `Pada hari ${eventLabel}`
  return `${daysBeforeTrigger} hari sebelum ${eventLabel}`
}
