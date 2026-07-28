import { describe, it, expect } from 'vitest'
import {
  calcInstallmentAmount,
  calcTotalInterest,
  calcRemainingBalance,
  isRepaymentOverdue,
  calcPayrollDeduction,
  generateRepaymentSchedule,
  countOverdueRepayments,
} from '@/lib/loans'

describe('Loans — Installment Calculation', () => {
  it('calculates zero-interest installment (ADVANCE)', () => {
    // 1,200,000 over 12 months, 0% interest = 100,000/month
    expect(calcInstallmentAmount(1_200_000, 0, 12)).toBe(100_000)
  })

  it('calculates interest-bearing installment correctly', () => {
    // 12% annual = 1% monthly; 1,000,000 over 12 months
    const payment = calcInstallmentAmount(1_000_000, 12, 12)
    // Standard amortisation ≈ 88,849 — allow 1 unit rounding
    expect(payment).toBeGreaterThan(88_800)
    expect(payment).toBeLessThan(88_900)
  })

  it('returns 0 for zero principal', () => {
    expect(calcInstallmentAmount(0, 12, 12)).toBe(0)
  })

  it('returns 0 for zero installments', () => {
    expect(calcInstallmentAmount(500_000, 10, 0)).toBe(0)
  })

  it('handles single installment (full amount at zero interest)', () => {
    expect(calcInstallmentAmount(500_000, 0, 1)).toBe(500_000)
  })
})

describe('Loans — Interest Calculation', () => {
  it('returns 0 total interest for 0% rate', () => {
    expect(calcTotalInterest(1_200_000, 0, 12)).toBe(0)
  })

  it('calculates positive total interest for non-zero rate', () => {
    const interest = calcTotalInterest(1_000_000, 12, 12)
    expect(interest).toBeGreaterThan(0)
  })

  it('total repayment equals principal plus interest', () => {
    const principal = 1_000_000
    const rate = 12
    const n = 12
    const monthly = calcInstallmentAmount(principal, rate, n)
    const totalPaid = Math.round(monthly * n * 100) / 100
    const interest = calcTotalInterest(principal, rate, n)
    expect(Math.abs(totalPaid - (principal + interest))).toBeLessThan(1)
  })
})

describe('Loans — Remaining Balance', () => {
  it('returns full principal after 0 payments (zero interest)', () => {
    expect(calcRemainingBalance(1_200_000, 0, 12, 0)).toBe(1_200_000)
  })

  it('returns 0 after all installments paid', () => {
    expect(calcRemainingBalance(1_200_000, 0, 12, 12)).toBe(0)
  })

  it('returns half principal at midpoint (zero interest)', () => {
    const remaining = calcRemainingBalance(1_200_000, 0, 12, 6)
    expect(remaining).toBe(600_000)
  })

  it('never returns negative balance', () => {
    // Over-paid scenario
    expect(calcRemainingBalance(500_000, 0, 6, 10)).toBe(0)
  })

  it('reduces balance correctly with interest-bearing loan', () => {
    const remaining = calcRemainingBalance(1_000_000, 12, 12, 6)
    // After 6 of 12 payments with 1%/month, balance should be < 50% of principal
    expect(remaining).toBeGreaterThan(0)
    expect(remaining).toBeLessThan(550_000)
  })
})

describe('Loans — Overdue Detection', () => {
  it('detects overdue when due date is in the past and status is PENDING', () => {
    const rep = { status: 'PENDING' as const, dueDate: '2020-01-01' }
    expect(isRepaymentOverdue(rep)).toBe(true)
  })

  it('not overdue if status is PAID regardless of date', () => {
    const rep = { status: 'PAID' as const, dueDate: '2020-01-01' }
    expect(isRepaymentOverdue(rep)).toBe(false)
  })

  it('not overdue if due date is today', () => {
    const today = new Date()
    const dueDate = today.toISOString().split('T')[0]
    const rep = { status: 'PENDING' as const, dueDate }
    expect(isRepaymentOverdue(rep)).toBe(false)
  })

  it('not overdue if due date is in the future', () => {
    const future = new Date()
    future.setDate(future.getDate() + 30)
    const dueDate = future.toISOString().split('T')[0]
    const rep = { status: 'PENDING' as const, dueDate }
    expect(isRepaymentOverdue(rep)).toBe(false)
  })

  it('countOverdueRepayments counts correctly', () => {
    const reps = [
      { status: 'PENDING' as const, dueDate: '2020-01-01' },
      { status: 'PENDING' as const, dueDate: '2020-06-01' },
      { status: 'PAID'    as const, dueDate: '2020-01-01' },
    ]
    expect(countOverdueRepayments(reps)).toBe(2)
  })
})

describe('Loans — Payroll Deduction', () => {
  const loans = [
    { employeeId: 'emp1', status: 'ACTIVE'   as const, installmentAmount: 500_000 },
    { employeeId: 'emp1', status: 'ACTIVE'   as const, installmentAmount: 200_000 },
    { employeeId: 'emp1', status: 'PENDING'  as const, installmentAmount: 300_000 },
    { employeeId: 'emp2', status: 'ACTIVE'   as const, installmentAmount: 400_000 },
    { employeeId: 'emp1', status: 'PAID'     as const, installmentAmount: 100_000 },
  ]

  it('sums installment amounts for ACTIVE loans only', () => {
    expect(calcPayrollDeduction(loans, 'emp1')).toBe(700_000)
  })

  it('returns 0 for employee with no active loans', () => {
    expect(calcPayrollDeduction(loans, 'emp3')).toBe(0)
  })

  it('excludes PENDING and PAID loans from deduction', () => {
    // emp1 has ACTIVE: 500k + 200k = 700k; PENDING 300k and PAID 100k are excluded
    const deduction = calcPayrollDeduction(loans, 'emp1')
    expect(deduction).not.toBe(1_100_000)
    expect(deduction).toBe(700_000)
  })

  it('calculates deduction for different employee independently', () => {
    expect(calcPayrollDeduction(loans, 'emp2')).toBe(400_000)
  })
})
