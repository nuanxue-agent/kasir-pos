import { describe, it, expect } from 'vitest'
import {
  BPJS_RATES,
  KESEHATAN_WAGE_CAP,
  calcKesehatanContribution,
  calcKetenagakerjaanContribution,
  calcTotalBPJSContribution,
  calcBPJSDueDate,
  isContributionOverdue,
} from '@/lib/bpjs'

// ─── BPJS Kesehatan Rates ─────────────────────────────────────────────────────

describe('BPJS Kesehatan — contribution rates', () => {
  it('employee rate is 1%', () => {
    expect(BPJS_RATES.KESEHATAN.employee).toBe(0.01)
  })

  it('employer rate is 4%', () => {
    expect(BPJS_RATES.KESEHATAN.employer).toBe(0.04)
  })

  it('calculates correct employee contribution on 5,000,000 salary', () => {
    const { employeeContribution } = calcKesehatanContribution(5_000_000)
    expect(employeeContribution).toBe(50_000) // 1%
  })

  it('calculates correct employer contribution on 5,000,000 salary', () => {
    const { employerContribution } = calcKesehatanContribution(5_000_000)
    expect(employerContribution).toBe(200_000) // 4%
  })

  it('caps wage at KESEHATAN_WAGE_CAP (12,000,000)', () => {
    const { employeeContribution } = calcKesehatanContribution(20_000_000)
    // Should use 12,000,000 cap: 1% of 12,000,000 = 120,000
    expect(employeeContribution).toBe(Math.round(KESEHATAN_WAGE_CAP * 0.01))
  })

  it('totalContribution equals employeeContribution + employerContribution', () => {
    const result = calcKesehatanContribution(8_000_000)
    expect(result.totalContribution).toBe(result.employeeContribution + result.employerContribution)
  })
})

// ─── BPJS Ketenagakerjaan JHT Rates ──────────────────────────────────────────

describe('BPJS Ketenagakerjaan — JHT rates', () => {
  it('JHT employee rate is 2%', () => {
    expect(BPJS_RATES.JHT.employee).toBe(0.02)
  })

  it('JHT employer rate is 3.7%', () => {
    expect(BPJS_RATES.JHT.employer).toBe(0.037)
  })

  it('employee contribution includes JHT on 5,000,000 salary', () => {
    // JHT emp: 2% = 100,000; JP emp: 1% = 50,000 → total employee = 150,000
    const { employeeContribution } = calcKetenagakerjaanContribution(5_000_000)
    const jhtEmp = Math.round(5_000_000 * 0.02)
    const jpEmp  = Math.round(5_000_000 * 0.01)
    expect(employeeContribution).toBe(jhtEmp + jpEmp)
  })
})

// ─── BPJS JKK / JKM Rates ────────────────────────────────────────────────────

describe('BPJS Ketenagakerjaan — JKK and JKM rates', () => {
  it('JKK employer rate is 0.24% (medium risk)', () => {
    expect(BPJS_RATES.JKK.employer).toBe(0.0024)
  })

  it('JKM employer rate is 0.3%', () => {
    expect(BPJS_RATES.JKM.employer).toBe(0.003)
  })

  it('employer contribution includes JKK + JKM + JHT + JP', () => {
    const salary = 5_000_000
    const { employerContribution } = calcKetenagakerjaanContribution(salary)
    const expected =
      Math.round(salary * BPJS_RATES.JHT.employer) +
      Math.round(salary * BPJS_RATES.JKK.employer) +
      Math.round(salary * BPJS_RATES.JKM.employer) +
      Math.round(salary * BPJS_RATES.JP.employer)
    expect(employerContribution).toBe(expected)
  })
})

// ─── Monthly Contribution Calculation ────────────────────────────────────────

describe('BPJS — monthly contribution calculation', () => {
  it('calcTotalBPJSContribution returns correct grandTotal', () => {
    const salary = 6_000_000
    const result = calcTotalBPJSContribution(salary)
    expect(result.grandTotal).toBe(
      result.kesehatan.totalContribution + result.ketenagakerjaan.totalContribution,
    )
  })

  it('both program breakdowns are non-negative', () => {
    const result = calcTotalBPJSContribution(4_000_000)
    expect(result.kesehatan.totalContribution).toBeGreaterThan(0)
    expect(result.ketenagakerjaan.totalContribution).toBeGreaterThan(0)
  })
})

// ─── Due Date Calculation ─────────────────────────────────────────────────────

describe('BPJS — due date calculation', () => {
  it('due date is the 10th of the month following the period', () => {
    expect(calcBPJSDueDate('2025-01')).toBe('2025-02-10')
  })

  it('wraps December period to January of the next year', () => {
    expect(calcBPJSDueDate('2025-12')).toBe('2026-01-10')
  })

  it('isContributionOverdue returns false for PAID status', () => {
    expect(isContributionOverdue({ status: 'PAID', dueDate: '2020-01-10' })).toBe(false)
  })

  it('isContributionOverdue returns true for past PENDING contribution', () => {
    expect(isContributionOverdue({ status: 'PENDING', dueDate: '2020-01-10' })).toBe(true)
  })

  it('isContributionOverdue returns false for future due date', () => {
    const future = new Date()
    future.setFullYear(future.getFullYear() + 1)
    const dueDate = future.toISOString().split('T')[0]
    expect(isContributionOverdue({ status: 'PENDING', dueDate })).toBe(false)
  })
})
