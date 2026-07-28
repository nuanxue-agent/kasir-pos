// ─── Referral pure helpers ────────────────────────────────────────────────────
// All functions are pure / side-effect-free so they can be tested in isolation.

export type RewardType = 'DISCOUNT' | 'POINTS' | 'CASH'
export type ReferralStatus = 'PENDING' | 'QUALIFIED' | 'REWARDED'

export interface ReferralProgram {
  id: string
  storeId: string
  name: string
  rewardType: RewardType
  rewardAmount: number
  active: boolean
  createdAt: string
}

export interface CustomerReferral {
  id: string
  programId: string
  referrerId: string
  refereeId: string | null
  storeId: string
  status: ReferralStatus
  createdAt: string
}

// ─── Referral code generation ─────────────────────────────────────────────────

const CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const CODE_LENGTH = 8

/**
 * Generate a unique referral code for a customer.
 * Uses crypto.getRandomValues when available, falls back to Math.random.
 */
export function generateReferralCode(): string {
  let code = ''
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(CODE_LENGTH)
    crypto.getRandomValues(bytes)
    for (let i = 0; i < CODE_LENGTH; i++) {
      code += CODE_CHARS[bytes[i] % CODE_CHARS.length]
    }
  } else {
    for (let i = 0; i < CODE_LENGTH; i++) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
    }
  }
  return code
}

/**
 * Derive a deterministic referral code from a customer ID.
 * Useful for seeding or display — not cryptographically random.
 */
export function deriveReferralCode(customerId: string): string {
  // Take last 8 chars of a salted hash-like mix
  const seed = customerId.replace(/-/g, '').toUpperCase()
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i++) {
    const idx = seed.charCodeAt(i % seed.length) % CODE_CHARS.length
    code += CODE_CHARS[idx]
  }
  return code
}

// ─── Conversion rate ──────────────────────────────────────────────────────────

/**
 * Calculate referral conversion rate as a percentage (0–100).
 * A referral is "converted" when its status is QUALIFIED or REWARDED.
 */
export function calcConversionRate(referrals: Pick<CustomerReferral, 'status'>[]): number {
  if (referrals.length === 0) return 0
  const converted = referrals.filter(
    (r) => r.status === 'QUALIFIED' || r.status === 'REWARDED',
  ).length
  return Math.round((converted / referrals.length) * 100)
}

// ─── Reward amount calculation ────────────────────────────────────────────────

/**
 * Calculate total rewards issued for REWARDED referrals.
 */
export function calcTotalRewardsIssued(
  referrals: Pick<CustomerReferral, 'status'>[],
  rewardAmount: number,
): number {
  const rewarded = referrals.filter((r) => r.status === 'REWARDED').length
  return rewarded * rewardAmount
}

/**
 * Format reward label based on type and amount.
 */
export function formatRewardLabel(type: RewardType, amount: number, currency = 'IDR'): string {
  if (type === 'DISCOUNT') return `${amount}% diskon`
  if (type === 'POINTS') return `${amount} poin`
  // CASH
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency, minimumFractionDigits: 0 })
    .format(amount)
    .replace('IDR', 'Rp')
    .trim()
}

// ─── Status transition logic ──────────────────────────────────────────────────

/** Valid forward transitions for a referral status */
const VALID_TRANSITIONS: Record<ReferralStatus, ReferralStatus[]> = {
  PENDING: ['QUALIFIED'],
  QUALIFIED: ['REWARDED'],
  REWARDED: [],
}

/**
 * Returns true if transitioning from `current` to `next` is allowed.
 */
export function isValidStatusTransition(
  current: ReferralStatus,
  next: ReferralStatus,
): boolean {
  return VALID_TRANSITIONS[current]?.includes(next) ?? false
}

/**
 * Apply a status transition; throws if invalid.
 */
export function applyStatusTransition(
  current: ReferralStatus,
  next: ReferralStatus,
): ReferralStatus {
  if (!isValidStatusTransition(current, next)) {
    throw new Error(`Invalid transition: ${current} → ${next}`)
  }
  return next
}

// ─── Duplicate prevention ─────────────────────────────────────────────────────

/**
 * Returns true if a referral from `referrerId` to `refereeId` already exists.
 */
export function isDuplicateReferral(
  existing: Pick<CustomerReferral, 'referrerId' | 'refereeId'>[],
  referrerId: string,
  refereeId: string,
): boolean {
  return existing.some((r) => r.referrerId === referrerId && r.refereeId === refereeId)
}

/**
 * Returns true if a referee has already been referred by anyone (one referral per referee).
 */
export function isAlreadyReferred(
  existing: Pick<CustomerReferral, 'refereeId'>[],
  refereeId: string,
): boolean {
  return existing.some((r) => r.refereeId === refereeId)
}
