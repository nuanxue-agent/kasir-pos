/**
 * @module loans
 * Pure business logic for employee loans and salary advances.
 * No DB or Next.js imports — safe to unit-test directly.
 */

export type LoanType = 'LOAN' | 'ADVANCE'
export type LoanStatus = 'PENDING' | 'APPROVED' | 'ACTIVE' | 'PAID' | 'REJECTED'
export type RepaymentStatus = 'PENDING' | 'PAID' | 'OVERDUE'

export interface EmployeeLoan {
  id: string
  storeId: string
  employeeId: string
  type: LoanType
  amount: number
  interestRate: number       // annual % e.g. 12 = 12%
  installments: number       // number of monthly installments
  installmentAmount: number  // computed monthly deduction
  status: LoanStatus
  approvedBy?: string | null
  approvedAt?: string | null
  startDate?: string | null  // YYYY-MM-DD
  createdAt: string
  updatedAt: string
}

export interface LoanRepayment {
  id: string
  loanId: string
  storeId: string
  amount: number
  dueDate: string    // YYYY-MM-DD
  paidAt?: string | null
  status: RepaymentStatus
}

/**
 * Calculate equal monthly installment (flat-rate method).
 * For ADVANCE type, interestRate is ignored (0%).
 * Returns amount rounded to 2 decimal places.
 */
export function calcInstallmentAmount(
  principal: number,
  annualInterestRate: number,
  installments: number,
): number {
  if (installments <= 0) return 0
  if (principal <= 0) return 0
  if (annualInterestRate <= 0) {
    return Math.round((principal / installments) * 100) / 100
  }
  const monthlyRate = annualInterestRate / 100 / 12
  // Standard amortization formula: P * r * (1+r)^n / ((1+r)^n - 1)
  const factor = Math.pow(1 + monthlyRate, installments)
  const payment = (principal * monthlyRate * factor) / (factor - 1)
  return Math.round(payment * 100) / 100
}

/**
 * Calculate total interest paid over the loan life.
 */
export function calcTotalInterest(
  principal: number,
  annualInterestRate: number,
  installments: number,
): number {
  const monthly = calcInstallmentAmount(principal, annualInterestRate, installments)
  const total = monthly * installments
  return Math.round((total - principal) * 100) / 100
}

/**
 * Calculate remaining balance given how many installments have been paid.
 * Uses flat amortization: each payment reduces principal proportionally,
 * remainder is interest.
 */
export function calcRemainingBalance(
  principal: number,
  annualInterestRate: number,
  installments: number,
  paidInstallments: number,
): number {
  if (paidInstallments >= installments) return 0
  if (annualInterestRate <= 0) {
    const perInstallment = principal / installments
    const remaining = principal - perInstallment * paidInstallments
    return Math.round(Math.max(0, remaining) * 100) / 100
  }
  // Amortization: remaining balance after k payments
  const monthlyRate = annualInterestRate / 100 / 12
  const payment = calcInstallmentAmount(principal, annualInterestRate, installments)
  let balance = principal
  for (let i = 0; i < paidInstallments; i++) {
    const interestCharge = balance * monthlyRate
    const principalPaid = payment - interestCharge
    balance -= principalPaid
  }
  return Math.round(Math.max(0, balance) * 100) / 100
}

/**
 * Detect if a repayment is overdue relative to a given date.
 * A repayment with status PAID is never overdue.
 * dueDate format: YYYY-MM-DD
 */
export function isRepaymentOverdue(
  repayment: Pick<LoanRepayment, 'status' | 'dueDate'>,
  now = new Date(),
): boolean {
  if (repayment.status === 'PAID') return false
  const due = new Date(repayment.dueDate)
  const dueDay = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate())
  const todayDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return todayDay > dueDay
}

/**
 * Calculate total payroll deduction for an employee in a given month.
 * Sums installmentAmount from all ACTIVE loans for the employee.
 */
export function calcPayrollDeduction(
  loans: Array<Pick<EmployeeLoan, 'employeeId' | 'status' | 'installmentAmount'>>,
  employeeId: string,
): number {
  return loans
    .filter(l => l.employeeId === employeeId && l.status === 'ACTIVE')
    .reduce((sum, l) => sum + l.installmentAmount, 0)
}

/**
 * Generate repayment schedule for a loan starting from startDate.
 * Returns array of { dueDate, amount } for each installment.
 */
export function generateRepaymentSchedule(
  loanId: string,
  storeId: string,
  principal: number,
  annualInterestRate: number,
  installments: number,
  startDate: string, // YYYY-MM-DD, first payment due date
): Omit<LoanRepayment, 'id' | 'paidAt'>[] {
  const monthlyPayment = calcInstallmentAmount(principal, annualInterestRate, installments)
  const schedule: Omit<LoanRepayment, 'id' | 'paidAt'>[] = []

  const base = new Date(startDate + 'T00:00:00Z')

  for (let i = 0; i < installments; i++) {
    const due = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + i, base.getUTCDate()))
    const dueDate = due.toISOString().split('T')[0]
    schedule.push({
      loanId,
      storeId,
      amount: monthlyPayment,
      dueDate,
      status: 'PENDING',
    })
  }
  return schedule
}

/**
 * Count overdue repayments in a list.
 */
export function countOverdueRepayments(
  repayments: Pick<LoanRepayment, 'status' | 'dueDate'>[],
  now = new Date(),
): number {
  return repayments.filter(r => isRepaymentOverdue(r, now)).length
}
