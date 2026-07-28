// Pure benefits logic — no DB or Next.js imports
// Exported for unit tests and re-exported from BenefitsClient

export type BenefitType =
  | 'BPJS_KESEHATAN'
  | 'BPJS_KETENAGAKERJAAN'
  | 'HEALTH'
  | 'MEAL'
  | 'TRANSPORT'
  | 'OTHER'

export type CalculationBase = 'FIXED' | 'PERCENTAGE_SALARY'

export interface BenefitPlan {
  id: string
  storeId: string
  name: string
  type: BenefitType
  employeeContribution: number
  employerContribution: number
  calculationBase: CalculationBase
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface EmployeeBenefit {
  id: string
  employeeId: string
  planId: string
  storeId: string
  active: boolean
  enrolledAt: string
  value: number
}

export interface ContributionResult {
  employeeAmount: number
  employerAmount: number
  total: number
}

/** BPJS Kesehatan: employee 1%, employer 4% of gross salary */
export function calcBpjsKesehatan(grossSalary: number): ContributionResult {
  const employeeAmount = Math.round(grossSalary * 0.01)
  const employerAmount = Math.round(grossSalary * 0.04)
  return { employeeAmount, employerAmount, total: employeeAmount + employerAmount }
}

/** BPJS Ketenagakerjaan: employee 2%, employer 3.7% of gross salary */
export function calcBpjsKetenagakerjaan(grossSalary: number): ContributionResult {
  const employeeAmount = Math.round(grossSalary * 0.02)
  const employerAmount = Math.round(grossSalary * 0.037)
  return { employeeAmount, employerAmount, total: employeeAmount + employerAmount }
}

/**
 * Calculate contribution amounts for a plan.
 * For PERCENTAGE_SALARY: contribution rates are treated as fractions (0–1).
 * For FIXED: values are absolute amounts.
 */
export function calcContribution(
  plan: Pick<BenefitPlan, 'employeeContribution' | 'employerContribution' | 'calculationBase'>,
  grossSalary: number,
): ContributionResult {
  if (plan.calculationBase === 'PERCENTAGE_SALARY') {
    const employeeAmount = Math.round(grossSalary * plan.employeeContribution)
    const employerAmount = Math.round(grossSalary * plan.employerContribution)
    return { employeeAmount, employerAmount, total: employeeAmount + employerAmount }
  }
  // FIXED
  return {
    employeeAmount: plan.employeeContribution,
    employerAmount: plan.employerContribution,
    total: plan.employeeContribution + plan.employerContribution,
  }
}

/** Sum total monthly employer cost across all active plans for a given salary */
export function calcMonthlyCost(
  plans: Pick<BenefitPlan, 'employeeContribution' | 'employerContribution' | 'calculationBase'>[],
  grossSalary: number,
): number {
  return plans.reduce((sum, plan) => {
    const { total } = calcContribution(plan, grossSalary)
    return sum + total
  }, 0)
}

/** Validate that an enrollment is not a duplicate for the same employee + plan */
export function isValidEnrollment(
  existingEnrollments: Pick<EmployeeBenefit, 'employeeId' | 'planId' | 'active'>[],
  employeeId: string,
  planId: string,
): { valid: boolean; reason?: string } {
  const dup = existingEnrollments.find(
    e => e.employeeId === employeeId && e.planId === planId && e.active,
  )
  if (dup) return { valid: false, reason: 'Karyawan sudah terdaftar di paket ini' }
  return { valid: true }
}

/** Filter only active enrollments */
export function getActiveEnrollments(enrollments: EmployeeBenefit[]): EmployeeBenefit[] {
  return enrollments.filter(e => e.active)
}

/** Get all plans of a specific type */
export function getPlansByType(plans: BenefitPlan[], type: BenefitType): BenefitPlan[] {
  return plans.filter(p => p.type === type && p.active)
}
