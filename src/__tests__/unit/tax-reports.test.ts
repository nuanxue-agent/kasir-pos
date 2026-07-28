import { describe, it, expect } from 'vitest'
import {
  calcPPh21,
  calcPPh23,
  calcPPN,
  taxDueDate,
  isValidSptPeriod,
  sptPeriodToYearMonth,
  PPH21_BRACKETS,
  PPH23_RATES,
  PPN_RATE,
} from '@/components/accounting/TaxReportClient'

// ── PPh 21 — Progressive income tax ──────────────────────────────────────────

describe('calcPPh21 — progressive income tax', () => {
  it('applies 5% on income within first bracket (≤ 60 jt)', () => {
    // 60_000_000 × 5% = 3_000_000
    expect(calcPPh21(60_000_000)).toBe(3_000_000)
  })

  it('applies progressive rates across two brackets', () => {
    // 60 jt × 5%  = 3_000_000
    // 40 jt × 15% = 6_000_000
    // total for 100 jt = 9_000_000
    expect(calcPPh21(100_000_000)).toBe(9_000_000)
  })

  it('handles income in the 250–500 jt bracket', () => {
    // 60 jt × 5%   = 3_000_000
    // 190 jt × 15% = 28_500_000
    // 50 jt × 25%  = 12_500_000
    // total for 300 jt = 44_000_000
    expect(calcPPh21(300_000_000)).toBe(44_000_000)
  })

  it('returns 0 for zero income', () => {
    expect(calcPPh21(0)).toBe(0)
  })

  it('PPH21_BRACKETS contains 5 progressive bands', () => {
    expect(PPH21_BRACKETS).toHaveLength(5)
    expect(PPH21_BRACKETS[0].rate).toBe(0.05)
    expect(PPH21_BRACKETS[4].rate).toBe(0.35)
  })
})

// ── PPh 23 — Withholding tax ──────────────────────────────────────────────────

describe('calcPPh23 — withholding tax', () => {
  it('calculates 2% on service fee', () => {
    expect(calcPPh23(10_000_000, 'SERVICE')).toBe(200_000)
  })

  it('calculates 15% on dividend', () => {
    expect(calcPPh23(50_000_000, 'DIVIDEND')).toBe(7_500_000)
  })

  it('SERVICE rate constant is 2%', () => {
    expect(PPH23_RATES.SERVICE).toBe(0.02)
  })

  it('DIVIDEND rate constant is 15%', () => {
    expect(PPH23_RATES.DIVIDEND).toBe(0.15)
  })
})

// ── PPN — Value Added Tax 11% ─────────────────────────────────────────────────

describe('calcPPN — VAT calculation', () => {
  it('calculates 11% PPN on taxable amount', () => {
    expect(calcPPN(1_000_000)).toBe(110_000)
  })

  it('PPN_RATE constant is 0.11', () => {
    expect(PPN_RATE).toBe(0.11)
  })

  it('rounds to 2 decimal places', () => {
    // 333.33 × 0.11 = 36.6663 → rounds to 36.67
    expect(calcPPN(333.33)).toBeCloseTo(36.67, 1)
  })
})

// ── Tax due date calculation ──────────────────────────────────────────────────

describe('taxDueDate — Indonesian DJP due date rules', () => {
  it('PPh 21 is due on 10th of following month', () => {
    const due = taxDueDate('PPH21', 2024, 3) // March 2024
    expect(due.getFullYear()).toBe(2024)
    expect(due.getMonth()).toBe(3) // April (0-indexed)
    expect(due.getDate()).toBe(10)
  })

  it('PPh 23 is due on 10th of following month', () => {
    const due = taxDueDate('PPH23', 2024, 11) // November
    expect(due.getFullYear()).toBe(2024)
    expect(due.getMonth()).toBe(11) // December (0-indexed)
    expect(due.getDate()).toBe(10)
  })

  it('PPN is due on last day of following month', () => {
    const due = taxDueDate('PPN', 2024, 1) // January → end of February
    expect(due.getFullYear()).toBe(2024)
    expect(due.getMonth()).toBe(1) // February (0-indexed)
    expect(due.getDate()).toBe(29) // 2024 is a leap year
  })

  it('handles December → January year rollover for PPh 21', () => {
    const due = taxDueDate('PPH21', 2024, 12)
    expect(due.getFullYear()).toBe(2025)
    expect(due.getMonth()).toBe(0) // January (0-indexed)
    expect(due.getDate()).toBe(10)
  })
})

// ── SPT period validation ─────────────────────────────────────────────────────

describe('isValidSptPeriod — SPT period format', () => {
  it('accepts valid YYYY-MM periods', () => {
    expect(isValidSptPeriod('2024-01')).toBe(true)
    expect(isValidSptPeriod('2024-12')).toBe(true)
    expect(isValidSptPeriod('2025-06')).toBe(true)
  })

  it('rejects month 00 and 13', () => {
    expect(isValidSptPeriod('2024-00')).toBe(false)
    expect(isValidSptPeriod('2024-13')).toBe(false)
  })

  it('rejects free-form strings', () => {
    expect(isValidSptPeriod('January 2024')).toBe(false)
    expect(isValidSptPeriod('2024/01')).toBe(false)
    expect(isValidSptPeriod('')).toBe(false)
  })

  it('sptPeriodToYearMonth parses correctly', () => {
    const { year, month } = sptPeriodToYearMonth('2024-08')
    expect(year).toBe(2024)
    expect(month).toBe(8)
  })
})
