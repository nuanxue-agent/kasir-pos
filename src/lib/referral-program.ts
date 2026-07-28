// ─── Referral Program pure helpers ───────────────────────────────────────────
// All functions are pure / side-effect-free so they can be tested in isolation.

export type ReferralRewardType = 'POINTS' | 'VOUCHER' | 'DISCOUNT'
export type ReferralRecordStatus = 'PENDING' | 'QUALIFIED' | 'REWARDED'

export interface ReferralProgramRecord {
  id: string
  storeId: string
  name: string
  rewardType: ReferralRewardType
  rewardValue: number
  referrerReward: number
  refereeReward: number
  active: boolean
  minPurchaseAmount: number
  createdAt: string
  updatedAt: string
}

export interface ReferralRecord {
  id: string
  programId: string
  storeId: string
  referrerId: string
  refereeId: string | null
  referralCode: string
  status: ReferralRecordStatus
  qualifiedAt: string | null
  rewardedAt: string | null
  createdAt: string
}

// ─── Referral code generation ─────────────────────────────────────────────────

const CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const CODE_PREFIX_LEN = 3
const CODE_RANDOM_LEN = 5

/**
 * Generate a referral code with optional customer prefix.
 * Format: [PREFIX][RANDOM] e.g. "CUS3AB12"
 */
export function generateProgramReferralCode(customerPrefix = ''): string {
  const prefix = customerPrefix
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, CODE_PREFIX_LEN)
    .padEnd(CODE_PREFIX_LEN, 'X')

  let random = ''
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(CODE_RANDOM_LEN)
    crypto.getRandomValues(bytes)
    for (let i = 0; i < CODE_RANDOM_LEN; i++) {
      random += CODE_CHARS[bytes[i] % CODE_CHARS.length]
    }
  } else {
    for (let i = 0; i < CODE_RANDOM_LEN; i++) {
      random += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
    }
  }
  return prefix + random
}

/**
 * Generate a referral link from a base URL and code.
 */
export function buildReferralLink(baseUrl: string, code: string): string {
  const url = baseUrl.replace(/\/$/, '')
  return `${url}/ref/${code}`
}

// ─── Reward calculation ───────────────────────────────────────────────────────

/**
 * Calculate reward for the referrer.
 */
export function calcReferrerReward(
  program: Pick<ReferralProgramRecord, 'rewardType' | 'referrerReward' | 'rewardValue'>,
): number {
  return program.referrerReward > 0 ? program.referrerReward : program.rewardValue
}

/**
 * Calculate reward for the referee (new customer).
 */
export function calcRefereeReward(
  program: Pick<ReferralProgramRecord, 'rewardType' | 'refereeReward' | 'rewardValue'>,
): number {
  return program.refereeReward > 0 ? program.refereeReward : program.rewardValue
}

/**
 * Format reward display string by type.
 */
export function formatProgramRewardLabel(
  type: ReferralRewardType,
  amount: number,
  currency = 'IDR',
): string {
  if (type === 'DISCOUNT') return `${amount}% diskon`
  if (type === 'POINTS') return `${amount} poin`
  // VOUCHER
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
  })
    .format(amount)
    .replace('IDR', 'Rp')
    .trim()
}

// ─── Qualification check ──────────────────────────────────────────────────────

/**
 * Check whether a referral qualifies based on purchase amount.
 * Returns true if purchaseAmount >= program's minPurchaseAmount.
 */
export function isReferralQualified(
  program: Pick<ReferralProgramRecord, 'minPurchaseAmount'>,
  purchaseAmount: number,
): boolean {
  return purchaseAmount >= program.minPurchaseAmount
}

// ─── Status transition logic ──────────────────────────────────────────────────

const VALID_RECORD_TRANSITIONS: Record<ReferralRecordStatus, ReferralRecordStatus[]> = {
  PENDING: ['QUALIFIED'],
  QUALIFIED: ['REWARDED'],
  REWARDED: [],
}

/**
 * Returns true if transitioning from `current` to `next` is allowed.
 */
export function isValidRecordTransition(
  current: ReferralRecordStatus,
  next: ReferralRecordStatus,
): boolean {
  return VALID_RECORD_TRANSITIONS[current]?.includes(next) ?? false
}

/**
 * Apply a status transition; throws if invalid.
 */
export function applyRecordTransition(
  current: ReferralRecordStatus,
  next: ReferralRecordStatus,
): ReferralRecordStatus {
  if (!isValidRecordTransition(current, next)) {
    throw new Error(`Transisi tidak valid: ${current} → ${next}`)
  }
  return next
}

// ─── Min purchase enforcement ─────────────────────────────────────────────────

/**
 * Validate that a program's minPurchaseAmount is non-negative.
 */
export function isValidMinPurchase(amount: number): boolean {
  return typeof amount === 'number' && amount >= 0
}

/**
 * Returns an error message if the purchase does not meet the minimum,
 * or null if it passes.
 */
export function checkMinPurchase(
  program: Pick<ReferralProgramRecord, 'minPurchaseAmount' | 'name'>,
  purchaseAmount: number,
): string | null {
  if (purchaseAmount < program.minPurchaseAmount) {
    return `Pembelian minimum Rp${program.minPurchaseAmount.toLocaleString('id-ID')} diperlukan untuk program "${program.name}"`
  }
  return null
}
