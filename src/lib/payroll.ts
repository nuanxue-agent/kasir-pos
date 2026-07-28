/**
 * @module payroll
 * Pure calculation functions for Indonesian payroll:
 * - Gross salary (basic + allowances)
 * - PPh 21 withholding (simplified progressive tariff)
 * - BPJS deductions (Kesehatan + Ketenagakerjaan)
 * - Net salary
 */

export interface Allowances {
  transport?: number
  meal?: number
  housing?: number
  position?: number
  [key: string]: number | undefined
}

export interface Deductions {
  pph21: number
  bpjs: number
  loan: number
  other: number
}

/** Sum all allowance values */
export function calcTotalAllowances(allowances: Allowances): number {
  return Object.values(allowances).reduce<number>((sum, v) => sum + (v ?? 0), 0)
}

/** Gross = basic salary + all allowances */
export function calcGrossSalary(basicSalary: number, allowances: Allowances): number {
  return basicSalary + calcTotalAllowances(allowances)
}

/**
 * PPh 21 monthly withholding — simplified tariff (Pasal 17 UU PPh).
 * Annual taxable income = gross * 12 (net of PTKP Rp 54,000,000/yr for TK/0).
 * Progressive rates: 5% up to 60M, 15% 60M–250M, 25% 250M–500M, 30% > 500M.
 * Returns monthly amount (annual tax / 12), minimum 0.
 */
export function calcPPh21Monthly(grossMonthly: number, ptkpAnnual = 54_000_000): number {
  const annualIncome = grossMonthly * 12
  const taxableIncome = Math.max(0, annualIncome - ptkpAnnual)

  let annualTax = 0
  if (taxableIncome <= 60_000_000) {
    annualTax = taxableIncome * 0.05
  } else if (taxableIncome <= 250_000_000) {
    annualTax = 60_000_000 * 0.05 + (taxableIncome - 60_000_000) * 0.15
  } else if (taxableIncome <= 500_000_000) {
    annualTax = 60_000_000 * 0.05 + 190_000_000 * 0.15 + (taxableIncome - 250_000_000) * 0.25
  } else {
    annualTax =
      60_000_000 * 0.05 +
      190_000_000 * 0.15 +
      250_000_000 * 0.25 +
      (taxableIncome - 500_000_000) * 0.3
  }

  return Math.round(annualTax / 12)
}

/**
 * BPJS deductions (employee portion only):
 * - Kesehatan: 1% of gross (employee), capped at salary ceiling Rp 12,000,000
 * - JHT (Ketenagakerjaan): 2% of gross
 * - JP (Jaminan Pensiun): 1% of gross, capped at Rp 9,559,600
 * Returns total employee BPJS deduction.
 */
export function calcBPJS(grossMonthly: number): {
  kesehatan: number
  jht: number
  jp: number
  total: number
} {
  const kesehatanBase = Math.min(grossMonthly, 12_000_000)
  const kesehatan = Math.round(kesehatanBase * 0.01)

  const jht = Math.round(grossMonthly * 0.02)

  const jpBase = Math.min(grossMonthly, 9_559_600)
  const jp = Math.round(jpBase * 0.01)

  return { kesehatan, jht, jp, total: kesehatan + jht + jp }
}

/**
 * Net salary = gross − PPh21 − BPJS − loan deduction − other deductions
 * Minimum 0.
 */
export function calcNetSalary(grossSalary: number, deductions: Deductions): number {
  const totalDeductions = deductions.pph21 + deductions.bpjs + deductions.loan + deductions.other
  return Math.max(0, grossSalary - totalDeductions)
}

/**
 * Build a complete deductions object for an employee.
 */
export function buildDeductions(
  grossSalary: number,
  loanDeduction = 0,
  otherDeduction = 0,
  ptkpAnnual = 54_000_000,
): Deductions {
  const pph21 = calcPPh21Monthly(grossSalary, ptkpAnnual)
  const bpjs = calcBPJS(grossSalary).total
  return { pph21, bpjs, loan: loanDeduction, other: otherDeduction }
}

/** Valid PayrollPeriod status transitions */
export type PeriodStatus = 'DRAFT' | 'PROCESSING' | 'APPROVED' | 'DISBURSED'

const PERIOD_TRANSITIONS: Record<PeriodStatus, PeriodStatus[]> = {
  DRAFT: ['PROCESSING'],
  PROCESSING: ['APPROVED', 'DRAFT'],
  APPROVED: ['DISBURSED', 'PROCESSING'],
  DISBURSED: [],
}

export function isValidPeriodTransition(from: PeriodStatus, to: PeriodStatus): boolean {
  return PERIOD_TRANSITIONS[from]?.includes(to) ?? false
}
