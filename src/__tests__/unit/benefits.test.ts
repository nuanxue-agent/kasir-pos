import { describe, it, expect } from 'vitest'

// ── Benefit types ──────────────────────────────────────────────────────────────
type BenefitType = 'BPJS_KESEHATAN' | 'BPJS_KETENAGAKERJAAN' | 'HEALTH' | 'MEAL' | 'TRANSPORT' | 'OTHER'
type CalculationBase = 'FIXED' | 'PERCENTAGE_SALARY'

interface BenefitPlan {
  id: string
  storeId: string
  name: string
  type: BenefitType
  employeeContribution: number
  employerContribution: number
  calculationBase: CalculationBase
  active: boolean
}

interface EmployeeBenefit {
  id: string
  employeeId: string
  planId: string
  storeId: string
  active: boolean
  enrolledAt: string
  value: number
}

interface Employee {
  id: string
  name: string
  baseSalary: number
}

// ── Pure calculation functions ─────────────────────────────────────────────────

function calcBenefitContributions(
  plan: Pick<BenefitPlan, 'calculationBase' | 'employeeContribution' | 'employerContribution'>,
  baseSalary: number
): { employeeAmount: number; employerAmount: number; total: number } {
  if (plan.calculationBase === 'FIXED') {
    return {
      employeeAmount: plan.employeeContribution,
      employerAmount: plan.employerContribution,
      total: plan.employeeContribution + plan.employerContribution,
    }
  }
  // PERCENTAGE_SALARY
  const empAmount = Math.round(baseSalary * (plan.employeeContribution / 100))
  const erAmount  = Math.round(baseSalary * (plan.employerContribution / 100))
  return { employeeAmount: empAmount, employerAmount: erAmount, total: empAmount + erAmount }
}

function calcBPJSKesehatan(
  baseSalary: number,
  empRate = 1,   // 1% employee
  erRate  = 4    // 4% employer
): { employeeAmount: number; employerAmount: number } {
  const BPJS_CAP = 12_000_000
  const capped = Math.min(baseSalary, BPJS_CAP)
  return {
    employeeAmount: Math.round(capped * (empRate / 100)),
    employerAmount: Math.round(capped * (erRate / 100)),
  }
}

function calcBPJSKetenagakerjaan(baseSalary: number): {
  jht_employee: number
  jht_employer: number
  jkk: number
  jkm: number
  total: number
} {
  const jht_employee = Math.round(baseSalary * 0.02)
  const jht_employer = Math.round(baseSalary * 0.037)
  const jkk          = Math.round(baseSalary * 0.0024)
  const jkm          = Math.round(baseSalary * 0.003)
  return { jht_employee, jht_employer, jkk, jkm, total: jht_employee + jht_employer + jkk + jkm }
}

function aggregateMonthlyCost(
  enrollments: Array<{
    plan: BenefitPlan
    employee: Employee
    active: boolean
  }>
): { employeeTotal: number; employerTotal: number; grandTotal: number; byType: Record<string, number> } {
  const active = enrollments.filter(e => e.active)
  let employeeTotal = 0
  let employerTotal = 0
  const byType: Record<string, number> = {}

  for (const { plan, employee } of active) {
    const c = calcBenefitContributions(plan, employee.baseSalary)
    employeeTotal += c.employeeAmount
    employerTotal += c.employerAmount
    byType[plan.type] = (byType[plan.type] ?? 0) + c.total
  }
  return { employeeTotal, employerTotal, grandTotal: employeeTotal + employerTotal, byType }
}

function validateEnrollment(
  employeeId: string,
  planId: string,
  existingEnrollments: EmployeeBenefit[]
): { valid: boolean; error?: string } {
  if (!employeeId) return { valid: false, error: 'employeeId is required' }
  if (!planId)     return { valid: false, error: 'planId is required' }
  const duplicate = existingEnrollments.find(
    e => e.employeeId === employeeId && e.planId === planId && e.active
  )
  if (duplicate) return { valid: false, error: 'Employee is already enrolled in this benefit plan' }
  return { valid: true }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('BPJS Kesehatan contribution calculation', () => {
  it('calculates employee 1% and employer 4% of salary', () => {
    const result = calcBPJSKesehatan(5_000_000)
    expect(result.employeeAmount).toBe(50_000)
    expect(result.employerAmount).toBe(200_000)
  })

  it('caps salary at 12,000,000 for BPJS Kesehatan', () => {
    const result = calcBPJSKesehatan(20_000_000)
    expect(result.employeeAmount).toBe(120_000)  // 1% of 12M cap
    expect(result.employerAmount).toBe(480_000)  // 4% of 12M cap
  })

  it('applies cap exactly at the cap boundary', () => {
    const result = calcBPJSKesehatan(12_000_000)
    expect(result.employeeAmount).toBe(120_000)
    expect(result.employerAmount).toBe(480_000)
  })
})

describe('BPJS Ketenagakerjaan contribution calculation', () => {
  it('calculates JHT 2% employee and 3.7% employer', () => {
    const result = calcBPJSKetenagakerjaan(5_000_000)
    expect(result.jht_employee).toBe(100_000)   // 2%
    expect(result.jht_employer).toBe(185_000)   // 3.7%
  })

  it('calculates JKK 0.24% and JKM 0.3% employer', () => {
    const result = calcBPJSKetenagakerjaan(5_000_000)
    expect(result.jkk).toBe(12_000)   // 0.24%
    expect(result.jkm).toBe(15_000)   // 0.3%
  })

  it('totals all components correctly', () => {
    const result = calcBPJSKetenagakerjaan(5_000_000)
    expect(result.total).toBe(result.jht_employee + result.jht_employer + result.jkk + result.jkm)
  })
})

describe('Percentage-based benefit calculation', () => {
  it('calculates percentage of salary correctly', () => {
    const plan: Pick<BenefitPlan, 'calculationBase' | 'employeeContribution' | 'employerContribution'> = {
      calculationBase: 'PERCENTAGE_SALARY',
      employeeContribution: 1,   // 1%
      employerContribution: 4,   // 4%
    }
    const result = calcBenefitContributions(plan, 8_000_000)
    expect(result.employeeAmount).toBe(80_000)
    expect(result.employerAmount).toBe(320_000)
    expect(result.total).toBe(400_000)
  })

  it('rounds fractional amounts to nearest integer', () => {
    const plan: Pick<BenefitPlan, 'calculationBase' | 'employeeContribution' | 'employerContribution'> = {
      calculationBase: 'PERCENTAGE_SALARY',
      employeeContribution: 0.5,
      employerContribution: 0.5,
    }
    const result = calcBenefitContributions(plan, 3_333_333)
    expect(Number.isInteger(result.employeeAmount)).toBe(true)
    expect(Number.isInteger(result.employerAmount)).toBe(true)
  })
})

describe('Fixed benefit amount', () => {
  it('returns exact fixed amount regardless of salary', () => {
    const plan: Pick<BenefitPlan, 'calculationBase' | 'employeeContribution' | 'employerContribution'> = {
      calculationBase: 'FIXED',
      employeeContribution: 0,
      employerContribution: 750_000,
    }
    expect(calcBenefitContributions(plan, 3_000_000).employerAmount).toBe(750_000)
    expect(calcBenefitContributions(plan, 10_000_000).employerAmount).toBe(750_000)
  })

  it('sums employee and employer fixed amounts', () => {
    const plan: Pick<BenefitPlan, 'calculationBase' | 'employeeContribution' | 'employerContribution'> = {
      calculationBase: 'FIXED',
      employeeContribution: 50_000,
      employerContribution: 200_000,
    }
    const result = calcBenefitContributions(plan, 5_000_000)
    expect(result.total).toBe(250_000)
  })
})

describe('Monthly cost aggregation', () => {
  const bpjsPlan: BenefitPlan = {
    id: 'p1', storeId: 's1', name: 'BPJS Kesehatan', type: 'BPJS_KESEHATAN',
    employeeContribution: 1, employerContribution: 4,
    calculationBase: 'PERCENTAGE_SALARY', active: true,
  }
  const mealPlan: BenefitPlan = {
    id: 'p2', storeId: 's1', name: 'Tunjangan Makan', type: 'MEAL',
    employeeContribution: 0, employerContribution: 600_000,
    calculationBase: 'FIXED', active: true,
  }
  const emp1: Employee = { id: 'e1', name: 'Budi',  baseSalary: 5_000_000 }
  const emp2: Employee = { id: 'e2', name: 'Sari',  baseSalary: 7_000_000 }

  it('aggregates total employer cost across all active enrollments', () => {
    const enrollments = [
      { plan: bpjsPlan, employee: emp1, active: true },
      { plan: mealPlan, employee: emp1, active: true },
    ]
    const result = aggregateMonthlyCost(enrollments)
    // BPJS: emp 50k, er 200k; meal: emp 0, er 600k
    expect(result.employerTotal).toBe(800_000)
    expect(result.employeeTotal).toBe(50_000)
    expect(result.grandTotal).toBe(850_000)
  })

  it('excludes inactive enrollments from cost totals', () => {
    const enrollments = [
      { plan: bpjsPlan, employee: emp1, active: true },
      { plan: mealPlan, employee: emp2, active: false },
    ]
    const result = aggregateMonthlyCost(enrollments)
    // Only BPJS for emp1 should count
    expect(result.grandTotal).toBe(250_000)
  })

  it('groups costs by benefit type', () => {
    const enrollments = [
      { plan: bpjsPlan, employee: emp1, active: true },
      { plan: bpjsPlan, employee: emp2, active: true },
      { plan: mealPlan, employee: emp1, active: true },
    ]
    const result = aggregateMonthlyCost(enrollments)
    expect(result.byType['BPJS_KESEHATAN']).toBeGreaterThan(0)
    expect(result.byType['MEAL']).toBe(600_000)
  })
})

describe('Enrollment validation', () => {
  const existing: EmployeeBenefit[] = [
    { id: 'b1', employeeId: 'e1', planId: 'p1', storeId: 's1', active: true, enrolledAt: '2024-01-01', value: 0 },
  ]

  it('rejects duplicate active enrollment for same employee and plan', () => {
    const result = validateEnrollment('e1', 'p1', existing)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('already enrolled')
  })

  it('allows enrollment if previous enrollment is inactive', () => {
    const inactive: EmployeeBenefit[] = [{ ...existing[0], active: false }]
    const result = validateEnrollment('e1', 'p1', inactive)
    expect(result.valid).toBe(true)
  })

  it('allows enrollment for different plan', () => {
    const result = validateEnrollment('e1', 'p2', existing)
    expect(result.valid).toBe(true)
  })

  it('rejects missing employeeId', () => {
    const result = validateEnrollment('', 'p1', existing)
    expect(result.valid).toBe(false)
    expect(result.error).toBe('employeeId is required')
  })
})
