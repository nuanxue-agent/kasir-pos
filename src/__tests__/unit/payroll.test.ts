import { describe, it, expect } from 'vitest'
import {
  calcTotalAllowances,
  calcGrossSalary,
  calcPPh21Monthly,
  calcBPJS,
  calcNetSalary,
  buildDeductions,
  isValidPeriodTransition,
  type PeriodStatus,
} from '@/lib/payroll'

// ─── Gross Salary ─────────────────────────────────────────────────────────────

describe('Payroll — Gross Salary', () => {
  it('calculates gross with no allowances', () => {
    expect(calcGrossSalary(5_000_000, {})).toBe(5_000_000)
  })

  it('sums all allowances correctly', () => {
    const allowances = { transport: 500_000, meal: 300_000, housing: 1_000_000 }
    expect(calcTotalAllowances(allowances)).toBe(1_800_000)
  })

  it('gross = basic + allowances', () => {
    const allowances = { transport: 500_000, meal: 300_000 }
    expect(calcGrossSalary(5_000_000, allowances)).toBe(5_800_000)
  })

  it('handles missing or undefined allowance values', () => {
    const allowances = { transport: 500_000, meal: undefined }
    expect(calcGrossSalary(4_000_000, allowances)).toBe(4_500_000)
  })
})

// ─── PPh 21 ───────────────────────────────────────────────────────────────────

describe('Payroll — PPh 21 Withholding', () => {
  it('returns 0 for income below PTKP', () => {
    // Annual = 2,000,000 * 12 = 24,000,000 < PTKP 54,000,000
    expect(calcPPh21Monthly(2_000_000)).toBe(0)
  })

  it('applies 5% bracket for taxable income ≤ 60M/year', () => {
    // Gross 6,000,000/mo → annual 72,000,000 − PTKP 54,000,000 = taxable 18,000,000
    // Tax = 18,000,000 * 5% = 900,000/yr → 75,000/mo
    expect(calcPPh21Monthly(6_000_000)).toBe(75_000)
  })

  it('applies 15% bracket for income between 60M–250M/year', () => {
    // Gross 25,000,000/mo → annual 300,000,000 − 54,000,000 = taxable 246,000,000
    // 5% on 60M = 3,000,000; 15% on 186,000,000 = 27,900,000; total 30,900,000/yr → 2,575,000/mo
    const monthly = calcPPh21Monthly(25_000_000)
    expect(monthly).toBeGreaterThan(2_000_000)
    expect(monthly).toBeLessThan(3_000_000)
  })

  it('monthly PPh21 is non-negative for any salary', () => {
    expect(calcPPh21Monthly(0)).toBeGreaterThanOrEqual(0)
    expect(calcPPh21Monthly(100_000_000)).toBeGreaterThanOrEqual(0)
  })
})

// ─── BPJS ─────────────────────────────────────────────────────────────────────

describe('Payroll — BPJS Deduction', () => {
  it('calculates all BPJS components for normal salary', () => {
    const bpjs = calcBPJS(5_000_000)
    expect(bpjs.kesehatan).toBe(50_000)  // 1% of 5,000,000
    expect(bpjs.jht).toBe(100_000)       // 2% of 5,000,000
    expect(bpjs.jp).toBe(50_000)         // 1% of 5,000,000
    expect(bpjs.total).toBe(200_000)
  })

  it('caps kesehatan at salary ceiling (12,000,000)', () => {
    const bpjs = calcBPJS(20_000_000)
    expect(bpjs.kesehatan).toBe(120_000) // 1% of cap 12,000,000
  })

  it('caps JP at 9,559,600 ceiling', () => {
    const bpjs = calcBPJS(20_000_000)
    expect(bpjs.jp).toBe(Math.round(9_559_600 * 0.01))
  })

  it('total equals sum of components', () => {
    const bpjs = calcBPJS(8_000_000)
    expect(bpjs.total).toBe(bpjs.kesehatan + bpjs.jht + bpjs.jp)
  })
})

// ─── Net Salary ───────────────────────────────────────────────────────────────

describe('Payroll — Net Salary', () => {
  it('net = gross minus all deductions', () => {
    const deductions = { pph21: 75_000, bpjs: 200_000, loan: 500_000, other: 0 }
    expect(calcNetSalary(5_800_000, deductions)).toBe(5_025_000)
  })

  it('net is never negative', () => {
    const deductions = { pph21: 10_000_000, bpjs: 10_000_000, loan: 10_000_000, other: 10_000_000 }
    expect(calcNetSalary(5_000_000, deductions)).toBe(0)
  })

  it('buildDeductions produces correct totals', () => {
    const d = buildDeductions(5_000_000, 200_000, 0)
    expect(d.pph21).toBeGreaterThanOrEqual(0)
    expect(d.bpjs).toBe(calcBPJS(5_000_000).total)
    expect(d.loan).toBe(200_000)
    expect(d.other).toBe(0)
  })
})

// ─── Period Status Transitions ────────────────────────────────────────────────

describe('Payroll — Period Status Transitions', () => {
  it('DRAFT can transition to PROCESSING', () => {
    expect(isValidPeriodTransition('DRAFT', 'PROCESSING')).toBe(true)
  })

  it('DRAFT cannot skip to APPROVED', () => {
    expect(isValidPeriodTransition('DRAFT', 'APPROVED')).toBe(false)
  })

  it('PROCESSING can transition to APPROVED', () => {
    expect(isValidPeriodTransition('PROCESSING', 'APPROVED')).toBe(true)
  })

  it('PROCESSING can roll back to DRAFT', () => {
    expect(isValidPeriodTransition('PROCESSING', 'DRAFT')).toBe(true)
  })

  it('APPROVED can transition to DISBURSED', () => {
    expect(isValidPeriodTransition('APPROVED', 'DISBURSED')).toBe(true)
  })

  it('DISBURSED has no valid outgoing transitions', () => {
    const targets: PeriodStatus[] = ['DRAFT', 'PROCESSING', 'APPROVED', 'DISBURSED']
    for (const t of targets) {
      expect(isValidPeriodTransition('DISBURSED', t)).toBe(false)
    }
  })
})
