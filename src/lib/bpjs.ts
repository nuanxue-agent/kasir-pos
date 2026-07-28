// BPJS contribution rate helpers
// Rates per Peraturan BPJS 2024

export const BPJS_RATES = {
  KESEHATAN: {
    employee: 0.01,   // 1%
    employer: 0.04,   // 4%
  },
  JHT: {             // Jaminan Hari Tua
    employee: 0.02,   // 2%
    employer: 0.037,  // 3.7%
  },
  JKK: {             // Jaminan Kecelakaan Kerja (varies by risk; use middle tier 0.24%)
    employee: 0,
    employer: 0.0024, // 0.24% (medium risk)
  },
  JKM: {             // Jaminan Kematian
    employee: 0,
    employer: 0.003,  // 0.3%
  },
  JP: {              // Jaminan Pensiun
    employee: 0.01,   // 1%
    employer: 0.02,   // 2%
  },
} as const

export type BPJSType = 'KESEHATAN' | 'KETENAGAKERJAAN'
export type BPJSClass = 1 | 2 | 3
export type ContributionStatus = 'PENDING' | 'PAID'
export type EnrollmentStatus = 'ACTIVE' | 'INACTIVE' | 'PENDING'

// Maximum wage cap for BPJS Kesehatan (12x PTKP approx)
export const KESEHATAN_WAGE_CAP = 12_000_000

export interface ContributionBreakdown {
  employeeContribution: number
  employerContribution: number
  totalContribution: number
}

/**
 * Calculate BPJS Kesehatan monthly contribution.
 * Wage is capped at KESEHATAN_WAGE_CAP.
 */
export function calcKesehatanContribution(baseSalary: number): ContributionBreakdown {
  const wage = Math.min(baseSalary, KESEHATAN_WAGE_CAP)
  const employeeContribution = Math.round(wage * BPJS_RATES.KESEHATAN.employee)
  const employerContribution = Math.round(wage * BPJS_RATES.KESEHATAN.employer)
  return {
    employeeContribution,
    employerContribution,
    totalContribution: employeeContribution + employerContribution,
  }
}

/**
 * Calculate BPJS Ketenagakerjaan monthly contribution (JHT + JKK + JKM + JP).
 */
export function calcKetenagakerjaanContribution(baseSalary: number): ContributionBreakdown {
  const jhtEmp = Math.round(baseSalary * BPJS_RATES.JHT.employee)
  const jhtEr  = Math.round(baseSalary * BPJS_RATES.JHT.employer)
  const jkkEr  = Math.round(baseSalary * BPJS_RATES.JKK.employer)
  const jkmEr  = Math.round(baseSalary * BPJS_RATES.JKM.employer)
  const jpEmp  = Math.round(baseSalary * BPJS_RATES.JP.employee)
  const jpEr   = Math.round(baseSalary * BPJS_RATES.JP.employer)

  const employeeContribution = jhtEmp + jpEmp
  const employerContribution = jhtEr + jkkEr + jkmEr + jpEr

  return {
    employeeContribution,
    employerContribution,
    totalContribution: employeeContribution + employerContribution,
  }
}

/**
 * Calculate total BPJS contribution for an employee (both programs combined).
 */
export function calcTotalBPJSContribution(baseSalary: number): {
  kesehatan: ContributionBreakdown
  ketenagakerjaan: ContributionBreakdown
  grandTotal: number
} {
  const kesehatan = calcKesehatanContribution(baseSalary)
  const ketenagakerjaan = calcKetenagakerjaanContribution(baseSalary)
  return {
    kesehatan,
    ketenagakerjaan,
    grandTotal: kesehatan.totalContribution + ketenagakerjaan.totalContribution,
  }
}

/**
 * Calculate the contribution due date for a given period (YYYY-MM).
 * BPJS contributions are due on the 10th of the following month.
 */
export function calcBPJSDueDate(period: string): string {
  // period format: YYYY-MM
  const [year, month] = period.split('-').map(Number)
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear  = month === 12 ? year + 1 : year
  const mm = String(nextMonth).padStart(2, '0')
  return `${nextYear}-${mm}-10`
}

/**
 * Check whether a contribution is overdue.
 */
export function isContributionOverdue(rec: { status: ContributionStatus; dueDate: string }): boolean {
  if (rec.status === 'PAID') return false
  const today = new Date().toISOString().split('T')[0]
  return rec.dueDate < today
}
