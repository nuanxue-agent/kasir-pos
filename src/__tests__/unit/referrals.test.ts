import { describe, it, expect } from 'vitest'
import {
  generateReferralCode,
  deriveReferralCode,
  calcConversionRate,
  calcTotalRewardsIssued,
  formatRewardLabel,
  isValidStatusTransition,
  applyStatusTransition,
  isDuplicateReferral,
  isAlreadyReferred,
  type ReferralStatus,
} from '@/lib/referrals'

// ─── generateReferralCode ─────────────────────────────────────────────────────

describe('generateReferralCode', () => {
  it('generates an 8-character code', () => {
    expect(generateReferralCode()).toHaveLength(8)
  })

  it('only contains uppercase letters and digits', () => {
    const code = generateReferralCode()
    expect(/^[A-Z0-9]{8}$/.test(code)).toBe(true)
  })

  it('generates unique codes on successive calls', () => {
    const codes = new Set(Array.from({ length: 100 }, () => generateReferralCode()))
    // Extremely unlikely to collide with 36^8 = ~2.8T combinations
    expect(codes.size).toBeGreaterThanOrEqual(95)
  })
})

// ─── calcConversionRate ───────────────────────────────────────────────────────

describe('calcConversionRate', () => {
  it('returns 0 for an empty referral list', () => {
    expect(calcConversionRate([])).toBe(0)
  })

  it('returns 100 when all referrals are REWARDED', () => {
    const referrals = [{ status: 'REWARDED' as ReferralStatus }, { status: 'REWARDED' as ReferralStatus }]
    expect(calcConversionRate(referrals)).toBe(100)
  })

  it('calculates correctly for mixed statuses', () => {
    const referrals = [
      { status: 'PENDING' as ReferralStatus },
      { status: 'QUALIFIED' as ReferralStatus },
      { status: 'REWARDED' as ReferralStatus },
      { status: 'PENDING' as ReferralStatus },
    ]
    // 2 out of 4 converted = 50%
    expect(calcConversionRate(referrals)).toBe(50)
  })
})

// ─── calcTotalRewardsIssued ───────────────────────────────────────────────────

describe('calcTotalRewardsIssued', () => {
  it('returns 0 when no referrals are REWARDED', () => {
    const referrals = [{ status: 'PENDING' as ReferralStatus }, { status: 'QUALIFIED' as ReferralStatus }]
    expect(calcTotalRewardsIssued(referrals, 10_000)).toBe(0)
  })

  it('multiplies reward amount by REWARDED count', () => {
    const referrals = [
      { status: 'REWARDED' as ReferralStatus },
      { status: 'REWARDED' as ReferralStatus },
      { status: 'PENDING' as ReferralStatus },
    ]
    expect(calcTotalRewardsIssued(referrals, 5_000)).toBe(10_000)
  })

  it('handles an empty list', () => {
    expect(calcTotalRewardsIssued([], 50_000)).toBe(0)
  })
})

// ─── formatRewardLabel ────────────────────────────────────────────────────────

describe('formatRewardLabel', () => {
  it('formats DISCOUNT reward correctly', () => {
    expect(formatRewardLabel('DISCOUNT', 15)).toBe('15% diskon')
  })

  it('formats POINTS reward correctly', () => {
    expect(formatRewardLabel('POINTS', 200)).toBe('200 poin')
  })
})

// ─── Status transition logic ──────────────────────────────────────────────────

describe('isValidStatusTransition', () => {
  it('allows PENDING → QUALIFIED', () => {
    expect(isValidStatusTransition('PENDING', 'QUALIFIED')).toBe(true)
  })

  it('allows QUALIFIED → REWARDED', () => {
    expect(isValidStatusTransition('QUALIFIED', 'REWARDED')).toBe(true)
  })

  it('disallows PENDING → REWARDED (skipping QUALIFIED)', () => {
    expect(isValidStatusTransition('PENDING', 'REWARDED')).toBe(false)
  })

  it('disallows going backwards: REWARDED → PENDING', () => {
    expect(isValidStatusTransition('REWARDED', 'PENDING')).toBe(false)
  })

  it('disallows REWARDED → QUALIFIED', () => {
    expect(isValidStatusTransition('REWARDED', 'QUALIFIED')).toBe(false)
  })
})

describe('applyStatusTransition', () => {
  it('returns the new status on a valid transition', () => {
    expect(applyStatusTransition('PENDING', 'QUALIFIED')).toBe('QUALIFIED')
  })

  it('throws on an invalid transition', () => {
    expect(() => applyStatusTransition('PENDING', 'REWARDED')).toThrow()
  })
})

// ─── Duplicate referral prevention ───────────────────────────────────────────

describe('isDuplicateReferral', () => {
  const existing = [
    { referrerId: 'user-A', refereeId: 'user-B' },
    { referrerId: 'user-C', refereeId: 'user-D' },
  ]

  it('detects a duplicate referrer→referee pair', () => {
    expect(isDuplicateReferral(existing, 'user-A', 'user-B')).toBe(true)
  })

  it('returns false when the pair does not exist', () => {
    expect(isDuplicateReferral(existing, 'user-A', 'user-D')).toBe(false)
  })
})

describe('isAlreadyReferred', () => {
  const existing = [{ refereeId: 'user-B' }, { refereeId: 'user-D' }]

  it('returns true if referee was already referred by someone', () => {
    expect(isAlreadyReferred(existing, 'user-B')).toBe(true)
  })

  it('returns false if referee has not been referred yet', () => {
    expect(isAlreadyReferred(existing, 'user-Z')).toBe(false)
  })
})
