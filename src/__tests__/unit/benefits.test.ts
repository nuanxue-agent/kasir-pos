import { describe, it, expect } from 'vitest'
import {
  calcBpjsKesehatan,
  calcBpjsKetenagakerjaan,
  calcContribution,
  calcMonthlyCost,
  isValidEnrollment,
  getActiveEnrollments,
  getPlansByType,
  type BenefitPlan,
  type EmployeeBenefit,
} from '@/lib/benefits'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const basePlan = (overrides: Partial<BenefitPlan> = {}): BenefitPlan => ({
  id: 'plan-1',
  storeId: 'store-1',
  name: 'BPJS Kesehatan',
  type: 'BPJS_KESEHATAN',
  employeeContribution: 0.01,
  employerContribution: 0.04,
  calculationBase: 'PERCENTAGE_SALARY',
  active: true,
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  ...overrides,
})

const baseEnrollment = (overrides: Partial<EmployeeBenefit> = {}): EmployeeBenefit => ({
  id: 'enr-1',
  employeeId: 'emp-1',
  planId: 'plan-1',
  storeId: 'store-1',
  active: true,
  enrolledAt: '2025-01-01T00:00:00Z',
  value: 0,
  ...overrides,
})

// ─── BPJS Kesehatan ───────────────────────────────────────────────────────────

describe('calcBpjsKesehatan', () => {
  it('should calculate employee contribution as 1% of salary', () => {
    const result = calcBpjsKesehatan(5_000_000)
    expect(result.employeeAmount).toBe(50_000)
  })

  it('should calculate employer contribution as 4% of salary', () => {
    const result = calcBpjsKesehatan(5_000_000)
    expect(result.employerAmount).toBe(200_000)
  })

  it('should return correct total (5% of salary)', () => {
    const result = calcBpjsKesehatan(5_000_000)
    expect(result.total).toBe(250_000)
  })

  it('should handle zero salary', () => {
    const result = calcBpjsKesehatan(0)
    expect(result.employeeAmount).toBe(0)
    expect(result.employerAmount).toBe(0)
    expect(result.total).toBe(0)
  })
})

// ─── BPJS Ketenagakerjaan ─────────────────────────────────────────────────────

describe('calcBpjsKetenagakerjaan', () => {
  it('should calculate employee contribution as 2% of salary', () => {
    const result = calcBpjsKetenagakerjaan(5_000_000)
    expect(result.employeeAmount).toBe(100_000)
  })

  it('should calculate employer contribution as 3.7% of salary', () => {
    const result = calcBpjsKetenagakerjaan(5_000_000)
    expect(result.employerAmount).toBe(185_000)
  })
})

// ─── calcContribution ─────────────────────────────────────────────────────────

describe('calcContribution', () => {
  it('should calculate percentage-based contribution correctly', () => {
    const plan = basePlan({ calculationBase: 'PERCENTAGE_SALARY', employeeContribution: 0.01, employerContribution: 0.04 })
    const result = calcContribution(plan, 10_000_000)
    expect(result.employeeAmount).toBe(100_000)
    expect(result.employerAmount).toBe(400_000)
    expect(result.total).toBe(500_000)
  })

  it('should return fixed amounts for FIXED base', () => {
    const plan = basePlan({ calculationBase: 'FIXED', employeeContribution: 50_000, employerContribution: 200_000 })
    const result = calcContribution(plan, 999_999) // salary irrelevant for FIXED
    expect(result.employeeAmount).toBe(50_000)
    expect(result.employerAmount).toBe(200_000)
    expect(result.total).toBe(250_000)
  })
})

// ─── calcMonthlyCost ──────────────────────────────────────────────────────────

describe('calcMonthlyCost', () => {
  it('should aggregate total cost across multiple plans', () => {
    const plans = [
      basePlan({ calculationBase: 'FIXED', employeeContribution: 50_000, employerContribution: 200_000 }),
      basePlan({ calculationBase: 'FIXED', employeeContribution: 25_000, employerContribution: 100_000 }),
    ]
    const total = calcMonthlyCost(plans, 5_000_000)
    expect(total).toBe(375_000) // (50k+200k) + (25k+100k)
  })

  it('should return 0 for empty plan list', () => {
    expect(calcMonthlyCost([], 5_000_000)).toBe(0)
  })
})

// ─── isValidEnrollment ────────────────────────────────────────────────────────

describe('isValidEnrollment', () => {
  it('should allow enrollment when no existing enrollment exists', () => {
    const result = isValidEnrollment([], 'emp-1', 'plan-1')
    expect(result.valid).toBe(true)
  })

  it('should reject duplicate active enrollment for same employee and plan', () => {
    const existing = [baseEnrollment({ employeeId: 'emp-1', planId: 'plan-1', active: true })]
    const result = isValidEnrollment(existing, 'emp-1', 'plan-1')
    expect(result.valid).toBe(false)
    expect(result.reason).toBeDefined()
  })

  it('should allow enrollment when existing enrollment is inactive', () => {
    const existing = [baseEnrollment({ employeeId: 'emp-1', planId: 'plan-1', active: false })]
    const result = isValidEnrollment(existing, 'emp-1', 'plan-1')
    expect(result.valid).toBe(true)
  })

  it('should allow same employee to enroll in a different plan', () => {
    const existing = [baseEnrollment({ employeeId: 'emp-1', planId: 'plan-1', active: true })]
    const result = isValidEnrollment(existing, 'emp-1', 'plan-2')
    expect(result.valid).toBe(true)
  })
})

// ─── getActiveEnrollments ─────────────────────────────────────────────────────

describe('getActiveEnrollments', () => {
  it('should return only active enrollments', () => {
    const enrollments = [
      baseEnrollment({ id: 'e1', active: true }),
      baseEnrollment({ id: 'e2', active: false }),
      baseEnrollment({ id: 'e3', active: true }),
    ]
    const result = getActiveEnrollments(enrollments)
    expect(result).toHaveLength(2)
    expect(result.every(e => e.active)).toBe(true)
  })
})

// ─── getPlansByType ───────────────────────────────────────────────────────────

describe('getPlansByType', () => {
  it('should filter plans by type and active status', () => {
    const plans = [
      basePlan({ id: 'p1', type: 'BPJS_KESEHATAN', active: true }),
      basePlan({ id: 'p2', type: 'MEAL', active: true }),
      basePlan({ id: 'p3', type: 'BPJS_KESEHATAN', active: false }),
    ]
    const result = getPlansByType(plans, 'BPJS_KESEHATAN')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('p1')
  })
})
