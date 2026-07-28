import { describe, it, expect } from 'vitest'

// ── Subscriptions — pure business logic ───────────────────────────────────────

type BillingCycle = 'MONTHLY' | 'QUARTERLY' | 'ANNUAL'
type SubscriptionStatus = 'ACTIVE' | 'CANCELLED' | 'EXPIRED' | 'PAUSED'

interface MembershipPlan {
  id: string
  name: string
  price: number
  billingCycle: BillingCycle
  durationDays: number
}

interface CustomerSubscription {
  id: string
  customerId: string
  planId: string
  status: SubscriptionStatus
  startDate: string
  nextBillingAt: string
  endDate?: string
  cancelledAt?: string
  autoRenew: boolean
  plan?: MembershipPlan
}

// ── Business logic functions ──────────────────────────────────────────────────

function calcNextBillingDate(currentDate: string, cycle: BillingCycle): string {
  const d = new Date(currentDate)
  if (cycle === 'MONTHLY') d.setMonth(d.getMonth() + 1)
  else if (cycle === 'QUARTERLY') d.setMonth(d.getMonth() + 3)
  else if (cycle === 'ANNUAL') d.setFullYear(d.getFullYear() + 1)
  return d.toISOString().slice(0, 10)
}

function calcMRR(subscriptions: CustomerSubscription[]): number {
  const active = subscriptions.filter(s => s.status === 'ACTIVE' && s.plan)
  let mrr = 0
  for (const sub of active) {
    const plan = sub.plan!
    if (plan.billingCycle === 'MONTHLY') mrr += plan.price
    else if (plan.billingCycle === 'QUARTERLY') mrr += plan.price / 3
    else if (plan.billingCycle === 'ANNUAL') mrr += plan.price / 12
  }
  return Math.round(mrr * 100) / 100
}

function calcChurnRate(
  activeAtStart: number,
  cancelledDuringPeriod: number,
): number {
  if (activeAtStart === 0) return 0
  return Math.round((cancelledDuringPeriod / activeAtStart) * 10000) / 100 // percentage with 2dp
}

function normalizeBillingCycle(input: string): BillingCycle {
  const map: Record<string, BillingCycle> = {
    monthly: 'MONTHLY',
    month: 'MONTHLY',
    m: 'MONTHLY',
    quarterly: 'QUARTERLY',
    quarter: 'QUARTERLY',
    q: 'QUARTERLY',
    annual: 'ANNUAL',
    yearly: 'ANNUAL',
    year: 'ANNUAL',
    y: 'ANNUAL',
  }
  const normalized = map[input.toLowerCase()]
  if (!normalized) throw new Error(`Unknown billing cycle: ${input}`)
  return normalized
}

function canTransitionStatus(
  current: SubscriptionStatus,
  next: SubscriptionStatus,
): boolean {
  const allowed: Record<SubscriptionStatus, SubscriptionStatus[]> = {
    ACTIVE: ['CANCELLED', 'PAUSED', 'EXPIRED'],
    PAUSED: ['ACTIVE', 'CANCELLED'],
    CANCELLED: [],
    EXPIRED: [],
  }
  return allowed[current].includes(next)
}

function isSubscriptionDue(sub: CustomerSubscription, today: string): boolean {
  return sub.status === 'ACTIVE' && sub.autoRenew && sub.nextBillingAt <= today
}

function calcARR(subscriptions: CustomerSubscription[]): number {
  return calcMRR(subscriptions) * 12
}

function durationDaysForCycle(cycle: BillingCycle): number {
  if (cycle === 'MONTHLY') return 30
  if (cycle === 'QUARTERLY') return 90
  if (cycle === 'ANNUAL') return 365
  return 30
}

// ── Tests ─────────────────────────────────────────────────────────────────────

const monthlyPlan: MembershipPlan = {
  id: 'plan-m', name: 'Basic Monthly', price: 50000,
  billingCycle: 'MONTHLY', durationDays: 30,
}
const annualPlan: MembershipPlan = {
  id: 'plan-a', name: 'Pro Annual', price: 480000,
  billingCycle: 'ANNUAL', durationDays: 365,
}
const quarterlyPlan: MembershipPlan = {
  id: 'plan-q', name: 'Standard Quarterly', price: 120000,
  billingCycle: 'QUARTERLY', durationDays: 90,
}

describe('Subscriptions — calcNextBillingDate', () => {
  it('adds 1 month for MONTHLY cycle', () => {
    expect(calcNextBillingDate('2025-01-15', 'MONTHLY')).toBe('2025-02-15')
  })

  it('adds 3 months for QUARTERLY cycle', () => {
    expect(calcNextBillingDate('2025-01-01', 'QUARTERLY')).toBe('2025-04-01')
  })

  it('adds 1 year for ANNUAL cycle', () => {
    expect(calcNextBillingDate('2025-03-20', 'ANNUAL')).toBe('2026-03-20')
  })
})

describe('Subscriptions — calcMRR', () => {
  it('counts monthly plan at face value', () => {
    const subs: CustomerSubscription[] = [
      { id: '1', customerId: 'c1', planId: 'plan-m', status: 'ACTIVE',
        startDate: '2025-01-01', nextBillingAt: '2025-02-01', autoRenew: true, plan: monthlyPlan },
    ]
    expect(calcMRR(subs)).toBe(50000)
  })

  it('converts annual plan to monthly equivalent', () => {
    const subs: CustomerSubscription[] = [
      { id: '1', customerId: 'c1', planId: 'plan-a', status: 'ACTIVE',
        startDate: '2025-01-01', nextBillingAt: '2026-01-01', autoRenew: true, plan: annualPlan },
    ]
    expect(calcMRR(subs)).toBe(40000) // 480000/12
  })

  it('converts quarterly plan to monthly equivalent', () => {
    const subs: CustomerSubscription[] = [
      { id: '1', customerId: 'c1', planId: 'plan-q', status: 'ACTIVE',
        startDate: '2025-01-01', nextBillingAt: '2025-04-01', autoRenew: true, plan: quarterlyPlan },
    ]
    expect(calcMRR(subs)).toBe(40000) // 120000/3
  })

  it('excludes CANCELLED subscriptions from MRR', () => {
    const subs: CustomerSubscription[] = [
      { id: '1', customerId: 'c1', planId: 'plan-m', status: 'CANCELLED',
        startDate: '2025-01-01', nextBillingAt: '2025-02-01', autoRenew: false, plan: monthlyPlan },
    ]
    expect(calcMRR(subs)).toBe(0)
  })

  it('sums MRR across multiple active subscriptions', () => {
    const subs: CustomerSubscription[] = [
      { id: '1', customerId: 'c1', planId: 'plan-m', status: 'ACTIVE',
        startDate: '2025-01-01', nextBillingAt: '2025-02-01', autoRenew: true, plan: monthlyPlan },
      { id: '2', customerId: 'c2', planId: 'plan-m', status: 'ACTIVE',
        startDate: '2025-01-01', nextBillingAt: '2025-02-01', autoRenew: true, plan: monthlyPlan },
    ]
    expect(calcMRR(subs)).toBe(100000)
  })
})

describe('Subscriptions — calcChurnRate', () => {
  it('calculates churn rate percentage', () => {
    expect(calcChurnRate(100, 5)).toBe(5)
  })

  it('returns 0 when no churn', () => {
    expect(calcChurnRate(100, 0)).toBe(0)
  })

  it('returns 0 when no active subs at start', () => {
    expect(calcChurnRate(0, 0)).toBe(0)
  })

  it('handles fractional churn rate', () => {
    expect(calcChurnRate(300, 1)).toBeCloseTo(0.33)
  })
})

describe('Subscriptions — status transitions', () => {
  it('allows ACTIVE → CANCELLED', () => {
    expect(canTransitionStatus('ACTIVE', 'CANCELLED')).toBe(true)
  })

  it('allows ACTIVE → PAUSED', () => {
    expect(canTransitionStatus('ACTIVE', 'PAUSED')).toBe(true)
  })

  it('does not allow CANCELLED → ACTIVE', () => {
    expect(canTransitionStatus('CANCELLED', 'ACTIVE')).toBe(false)
  })

  it('does not allow EXPIRED → ACTIVE', () => {
    expect(canTransitionStatus('EXPIRED', 'ACTIVE')).toBe(false)
  })

  it('allows PAUSED → ACTIVE (reactivation)', () => {
    expect(canTransitionStatus('PAUSED', 'ACTIVE')).toBe(true)
  })
})

describe('Subscriptions — billing cycle normalization', () => {
  it('normalizes "monthly" to MONTHLY', () => {
    expect(normalizeBillingCycle('monthly')).toBe('MONTHLY')
  })

  it('normalizes "yearly" to ANNUAL', () => {
    expect(normalizeBillingCycle('yearly')).toBe('ANNUAL')
  })

  it('normalizes "q" to QUARTERLY', () => {
    expect(normalizeBillingCycle('q')).toBe('QUARTERLY')
  })

  it('throws for unknown cycle', () => {
    expect(() => normalizeBillingCycle('biweekly')).toThrow()
  })
})

describe('Subscriptions — billing due & ARR', () => {
  it('marks subscription as due when nextBillingAt <= today', () => {
    const sub: CustomerSubscription = {
      id: '1', customerId: 'c1', planId: 'p1', status: 'ACTIVE',
      startDate: '2025-01-01', nextBillingAt: '2025-02-01', autoRenew: true,
    }
    expect(isSubscriptionDue(sub, '2025-02-01')).toBe(true)
    expect(isSubscriptionDue(sub, '2025-01-31')).toBe(false)
  })

  it('does not mark cancelled sub as due', () => {
    const sub: CustomerSubscription = {
      id: '1', customerId: 'c1', planId: 'p1', status: 'CANCELLED',
      startDate: '2025-01-01', nextBillingAt: '2025-02-01', autoRenew: true,
    }
    expect(isSubscriptionDue(sub, '2025-02-01')).toBe(false)
  })

  it('calculates ARR as 12x MRR', () => {
    const subs: CustomerSubscription[] = [
      { id: '1', customerId: 'c1', planId: 'plan-m', status: 'ACTIVE',
        startDate: '2025-01-01', nextBillingAt: '2025-02-01', autoRenew: true, plan: monthlyPlan },
    ]
    expect(calcARR(subs)).toBe(600000)
  })

  it('returns correct durationDays for each cycle', () => {
    expect(durationDaysForCycle('MONTHLY')).toBe(30)
    expect(durationDaysForCycle('QUARTERLY')).toBe(90)
    expect(durationDaysForCycle('ANNUAL')).toBe(365)
  })
})
