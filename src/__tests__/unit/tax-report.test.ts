import { describe, it, expect } from 'vitest'
import {
  calcPpnExclusive,
  calcPpnInclusive,
  calcPph23,
  isPph23Applicable,
  groupByPeriod,
  aggregateTaxSummary,
  generateEFakturRows,
} from '@/components/reports/TaxReportClient'
import type { EFakturRow } from '@/components/reports/TaxReportClient'

// ─── PPN calculation — exclusive (tax on top of price) ───────────────────────

describe('calcPpnExclusive', () => {
  it('calculates 11% PPN on DPP correctly', () => {
    expect(calcPpnExclusive(1_000_000, 0.11)).toBe(110_000)
  })

  it('calculates 12% PPN correctly', () => {
    expect(calcPpnExclusive(500_000, 0.12)).toBe(60_000)
  })

  it('returns 0 for zero rate (PPN-free)', () => {
    expect(calcPpnExclusive(1_000_000, 0)).toBe(0)
  })
})

// ─── PPN calculation — inclusive (price already includes tax) ────────────────

describe('calcPpnInclusive', () => {
  it('extracts DPP and PPN from inclusive price at 11%', () => {
    // Gross = 1_110_000, DPP = 1_000_000, PPN = 110_000
    const result = calcPpnInclusive(1_110_000, 0.11)
    expect(result.dpp).toBe(1_000_000)
    expect(result.ppn).toBe(110_000)
  })

  it('DPP + PPN equals gross amount', () => {
    const gross = 777_000
    const { dpp, ppn } = calcPpnInclusive(gross, 0.11)
    // Allow ±1 for rounding
    expect(Math.abs(dpp + ppn - gross)).toBeLessThanOrEqual(1)
  })

  it('returns zero tax when rate is 0', () => {
    const { dpp, ppn } = calcPpnInclusive(500_000, 0)
    expect(ppn).toBe(0)
    expect(dpp).toBe(500_000)
  })
})

// ─── PPh 23 threshold detection ──────────────────────────────────────────────

describe('isPph23Applicable', () => {
  it('applies PPh 23 for business customer above threshold', () => {
    expect(isPph23Applicable(500_000, 'business')).toBe(true)
  })

  it('does not apply for retail customer even above threshold', () => {
    expect(isPph23Applicable(1_000_000, 'retail')).toBe(false)
  })

  it('does not apply for business customer below threshold', () => {
    expect(isPph23Applicable(499_999, 'business')).toBe(false)
  })

  it('applies at exact threshold amount', () => {
    expect(isPph23Applicable(500_000, 'business', 500_000)).toBe(true)
  })
})

describe('calcPph23', () => {
  it('calculates 2% PPh 23 on DPP above threshold', () => {
    expect(calcPph23(1_000_000, 500_000, 0.02)).toBe(20_000)
  })

  it('returns 0 when DPP is below threshold', () => {
    expect(calcPph23(400_000, 500_000, 0.02)).toBe(0)
  })
})

// ─── Tax period grouping ──────────────────────────────────────────────────────

describe('groupByPeriod', () => {
  const items = [
    { date: '2024-01-15', amount: 100_000 },
    { date: '2024-01-28', amount: 200_000 },
    { date: '2024-03-10', amount: 150_000 },
    { date: '2024-07-01', amount: 300_000 },
  ]

  it('groups by month correctly', () => {
    const result = groupByPeriod(items, 'month')
    expect(result.get('2024-01')).toBe(300_000)
    expect(result.get('2024-03')).toBe(150_000)
    expect(result.get('2024-07')).toBe(300_000)
  })

  it('groups by quarter correctly', () => {
    const result = groupByPeriod(items, 'quarter')
    expect(result.get('2024-Q1')).toBe(450_000) // Jan + Mar
    expect(result.get('2024-Q3')).toBe(300_000) // Jul
  })

  it('groups by year correctly', () => {
    const result = groupByPeriod(items, 'year')
    expect(result.get('2024')).toBe(750_000)
  })
})

// ─── e-Faktur row generation ──────────────────────────────────────────────────

describe('generateEFakturRows', () => {
  const mockRows = [
    {
      period: '2024-01',
      grossRevenue: 1_110_000,
      taxableRevenue: 1_000_000,
      taxCollected: 110_000,
      pphBase: 0,
      pphCollected: 0,
      orderCount: 5,
      ppnRate: 0.11,
      categoryBreakdown: [],
    },
    {
      period: '2024-02',
      grossRevenue: 555_000,
      taxableRevenue: 500_000,
      taxCollected: 55_000,
      pphBase: 0,
      pphCollected: 0,
      orderCount: 3,
      ppnRate: 0.11,
      categoryBreakdown: [],
    },
  ]

  it('generates one e-Faktur row per period', () => {
    const rows = generateEFakturRows(mockRows)
    expect(rows).toHaveLength(2)
  })

  it('sets jenisFaktur to FK for output tax', () => {
    const rows = generateEFakturRows(mockRows)
    expect(rows[0].jenisFaktur).toBe('FK')
  })

  it('sets DPP and PPN correctly from period data', () => {
    const rows = generateEFakturRows(mockRows)
    expect(rows[0].dpp).toBe(1_000_000)
    expect(rows[0].ppn).toBe(110_000)
  })

  it('formats tanggalFaktur as DD/MM/YYYY for monthly period', () => {
    const rows = generateEFakturRows(mockRows)
    expect(rows[0].tanggalFaktur).toBe('01/01/2024')
  })
})

// ─── Tax summary aggregation ──────────────────────────────────────────────────

describe('aggregateTaxSummary', () => {
  const rows = [
    {
      period: '2024-01',
      grossRevenue: 1_000_000,
      taxableRevenue: 900_900,
      taxCollected: 99_099,
      pphBase: 0,
      pphCollected: 0,
      orderCount: 10,
      ppnRate: 0.11,
      categoryBreakdown: [],
    },
    {
      period: '2024-02',
      grossRevenue: 2_000_000,
      taxableRevenue: 1_801_802,
      taxCollected: 198_198,
      pphBase: 1_000_000,
      pphCollected: 20_000,
      orderCount: 20,
      ppnRate: 0.11,
      categoryBreakdown: [],
    },
  ]

  it('sums all revenue and tax fields across periods', () => {
    const summary = aggregateTaxSummary(rows)
    expect(summary.totalGross).toBe(3_000_000)
    expect(summary.totalTaxable).toBe(2_702_702)
    expect(summary.totalPpn).toBe(297_297)
  })

  it('sums PPh 23 fields correctly', () => {
    const summary = aggregateTaxSummary(rows)
    expect(summary.totalPphBase).toBe(1_000_000)
    expect(summary.totalPph).toBe(20_000)
  })

  it('sums total order count', () => {
    const summary = aggregateTaxSummary(rows)
    expect(summary.totalOrders).toBe(30)
  })

  it('returns zeros for empty rows array', () => {
    const summary = aggregateTaxSummary([])
    expect(summary.totalGross).toBe(0)
    expect(summary.totalPpn).toBe(0)
    expect(summary.totalOrders).toBe(0)
  })
})
