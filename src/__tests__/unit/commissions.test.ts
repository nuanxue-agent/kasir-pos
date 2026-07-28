import { describe, it, expect } from 'vitest'
import {
  calcFixedCommission,
  calcPercentageCommission,
  calcTieredCommission,
  applyRule,
  aggregateMonthlySummary,
  isValidStatusTransition,
  nextStatuses,
} from '@/lib/commissions'
import type { CommissionRule, CommissionEntry, TierBand } from '@/lib/commissions'

// ── Fixed Commission ──────────────────────────────────────────────────────────

describe('Fixed commission calculation', () => {
  it('returns the flat value regardless of sale amount', () => {
    expect(calcFixedCommission({ value: 50_000 })).toBe(50_000)
  })

  it('returns 0 for zero value', () => {
    expect(calcFixedCommission({ value: 0 })).toBe(0)
  })

  it('clamps negative value to 0', () => {
    expect(calcFixedCommission({ value: -1_000 })).toBe(0)
  })
})

// ── Percentage Commission ─────────────────────────────────────────────────────

describe('Percentage commission calculation', () => {
  it('calculates 5% of 2,000,000 correctly', () => {
    expect(calcPercentageCommission(2_000_000, { value: 5 })).toBe(100_000)
  })

  it('returns 0 for zero sale amount', () => {
    expect(calcPercentageCommission(0, { value: 5 })).toBe(0)
  })

  it('returns 0 for zero rate', () => {
    expect(calcPercentageCommission(1_000_000, { value: 0 })).toBe(0)
  })

  it('rounds fractional commission to nearest integer', () => {
    // 1,000,001 × 3% = 30,000.03 → 30,000
    expect(calcPercentageCommission(1_000_001, { value: 3 })).toBe(30_000)
  })
})

// ── Tiered Commission ─────────────────────────────────────────────────────────

describe('Tiered commission calculation', () => {
  const tiers: TierBand[] = [
    { minSales: 0, maxSales: 10_000_000, rate: 2 },
    { minSales: 10_000_000, maxSales: null, rate: 3 },
  ]

  it('applies single tier when sale is within first band', () => {
    // 5M × 2% = 100,000
    expect(calcTieredCommission(5_000_000, tiers)).toBe(100_000)
  })

  it('applies both tiers for sale spanning two bands', () => {
    // 10M × 2% = 200,000 + 5M × 3% = 150,000 = 350,000
    expect(calcTieredCommission(15_000_000, tiers)).toBe(350_000)
  })

  it('returns 0 for zero sale amount', () => {
    expect(calcTieredCommission(0, tiers)).toBe(0)
  })

  it('returns 0 for empty tiers array', () => {
    expect(calcTieredCommission(5_000_000, [])).toBe(0)
  })

  it('handles exactly the band boundary amount', () => {
    // Exactly 10M falls entirely in first tier: 10M × 2% = 200,000
    expect(calcTieredCommission(10_000_000, tiers)).toBe(200_000)
  })
})

// ── applyRule (inactive / threshold guards) ───────────────────────────────────

describe('applyRule — rule guards', () => {
  const baseRule: CommissionRule = {
    id: 'r1', storeId: 's1', employeeId: null,
    type: 'PERCENTAGE', value: 5,
    minSales: 1_000_000, maxSales: null,
    productCategory: null, active: true,
  }

  it('returns 0 for inactive rule', () => {
    expect(applyRule(5_000_000, { ...baseRule, active: false })).toBe(0)
  })

  it('returns 0 when sale is below minSales threshold', () => {
    expect(applyRule(500_000, baseRule)).toBe(0)
  })

  it('returns 0 when sale exceeds maxSales cap', () => {
    expect(applyRule(20_000_000, { ...baseRule, maxSales: 10_000_000 })).toBe(0)
  })
})

// ── Monthly Summary Aggregation ───────────────────────────────────────────────

describe('Monthly summary aggregation', () => {
  const entries: CommissionEntry[] = [
    { id: 'e1', ruleId: 'r1', storeId: 's1', employeeId: 'emp1', orderId: 'o1',
      saleAmount: 1_000_000, commissionAmount: 50_000, period: '2026-07', status: 'PENDING', paidAt: null },
    { id: 'e2', ruleId: 'r1', storeId: 's1', employeeId: 'emp1', orderId: 'o2',
      saleAmount: 2_000_000, commissionAmount: 100_000, period: '2026-07', status: 'APPROVED', paidAt: null },
    { id: 'e3', ruleId: 'r1', storeId: 's1', employeeId: 'emp2', orderId: 'o3',
      saleAmount: 500_000, commissionAmount: 25_000, period: '2026-07', status: 'PAID', paidAt: '2026-07-15T00:00:00Z' },
    // Different period — should be excluded
    { id: 'e4', ruleId: 'r1', storeId: 's1', employeeId: 'emp1', orderId: 'o4',
      saleAmount: 3_000_000, commissionAmount: 150_000, period: '2026-06', status: 'PAID', paidAt: null },
  ]

  it('aggregates total sales and commission per employee for given period', () => {
    const summary = aggregateMonthlySummary(entries, '2026-07')
    const emp1 = summary.find(s => s.employeeId === 'emp1')!
    expect(emp1.totalSales).toBe(3_000_000)
    expect(emp1.totalCommission).toBe(150_000)
  })

  it('counts statuses correctly per employee', () => {
    const summary = aggregateMonthlySummary(entries, '2026-07')
    const emp1 = summary.find(s => s.employeeId === 'emp1')!
    expect(emp1.pendingCount).toBe(1)
    expect(emp1.approvedCount).toBe(1)
    expect(emp1.paidCount).toBe(0)
  })

  it('excludes entries from other periods', () => {
    const summary = aggregateMonthlySummary(entries, '2026-07')
    const emp1 = summary.find(s => s.employeeId === 'emp1')!
    // emp1 has 3M total in 2026-07 (not 6M including 2026-06)
    expect(emp1.totalSales).toBe(3_000_000)
  })

  it('returns separate summaries for each employee', () => {
    const summary = aggregateMonthlySummary(entries, '2026-07')
    expect(summary.length).toBe(2)
  })
})

// ── Status Transition Validation ──────────────────────────────────────────────

describe('Status transition validation', () => {
  it('allows PENDING → APPROVED', () => {
    expect(isValidStatusTransition('PENDING', 'APPROVED')).toBe(true)
  })

  it('allows APPROVED → PAID', () => {
    expect(isValidStatusTransition('APPROVED', 'PAID')).toBe(true)
  })

  it('rejects PENDING → PAID (must go through APPROVED first)', () => {
    expect(isValidStatusTransition('PENDING', 'PAID')).toBe(false)
  })

  it('rejects PAID → APPROVED (cannot reverse paid status)', () => {
    expect(isValidStatusTransition('PAID', 'APPROVED')).toBe(false)
  })

  it('rejects PAID → PENDING (terminal state)', () => {
    expect(isValidStatusTransition('PAID', 'PENDING')).toBe(false)
  })

  it('nextStatuses returns empty array for PAID (terminal)', () => {
    expect(nextStatuses('PAID')).toEqual([])
  })

  it('nextStatuses returns [APPROVED] for PENDING', () => {
    expect(nextStatuses('PENDING')).toEqual(['APPROVED'])
  })
})
