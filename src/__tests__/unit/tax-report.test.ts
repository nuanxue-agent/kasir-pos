/**
 * Unit tests for tax report logic (PPN 11%)
 * Tests tax calculation, quarterly aggregation, annual totals,
 * tax rate application, and CSV export format.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Types ──────────────────────────────────────────────────────────────────
interface TaxMonthRow {
  month: number
  grossRevenue: number
  taxableRevenue: number
  taxCollected: number
  orderCount: number
}

// ── Pure helpers (mirrors TaxReportClient logic) ───────────────────────────

const TAX_RATE = 0.11
const TAX_INCLUSIVE_DIVISOR = 111 // gross = DPP × 111/100

/**
 * Compute taxable revenue (DPP) from tax-inclusive gross.
 * DPP = gross × 100 / 111
 */
function calcDPP(gross: number): number {
  return Math.round((gross * 100) / TAX_INCLUSIVE_DIVISOR)
}

/**
 * Compute PPN from tax-inclusive gross.
 * PPN = gross - DPP  (i.e. gross × 11/111)
 */
function calcPPN(gross: number): number {
  return gross - calcDPP(gross)
}

function sumRows(rows: TaxMonthRow[]) {
  return rows.reduce(
    (acc, r) => ({
      grossRevenue:   acc.grossRevenue   + r.grossRevenue,
      taxableRevenue: acc.taxableRevenue + r.taxableRevenue,
      taxCollected:   acc.taxCollected   + r.taxCollected,
      orderCount:     acc.orderCount     + r.orderCount,
    }),
    { grossRevenue: 0, taxableRevenue: 0, taxCollected: 0, orderCount: 0 },
  )
}

/** Fill all 12 months, zeroing missing entries */
function buildFullYear(rows: TaxMonthRow[]): TaxMonthRow[] {
  return Array.from({ length: 12 }, (_, i) => {
    const found = rows.find(r => r.month === i + 1)
    return found ?? { month: i + 1, grossRevenue: 0, taxableRevenue: 0, taxCollected: 0, orderCount: 0 }
  })
}

function getQuarterRows(allMonths: TaxMonthRow[], q: 1 | 2 | 3 | 4): TaxMonthRow[] {
  const starts = { 1: 1, 2: 4, 3: 7, 4: 10 }
  const start = starts[q]
  return allMonths.filter(r => r.month >= start && r.month < start + 3)
}

// ── CSV helper (mirrors exportToCSV from lib/export) ───────────────────────

function buildCSV(rows: Record<string, unknown>[], headers: string[]): string {
  const escape = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s
  }
  const lines = [
    headers.map(escape).join(','),
    ...rows.map(row => headers.map(k => escape(row[k])).join(',')),
  ]
  return lines.join('\n')
}

// ── Sample data ────────────────────────────────────────────────────────────

function makeSampleRows(): TaxMonthRow[] {
  // 3 months of data; rest are missing
  return [
    { month: 1,  grossRevenue: 11_100_000, taxableRevenue: 10_000_000, taxCollected: 1_100_000, orderCount: 50 },
    { month: 2,  grossRevenue:  5_550_000, taxableRevenue:  5_000_000, taxCollected:   550_000, orderCount: 25 },
    { month: 12, grossRevenue: 22_200_000, taxableRevenue: 20_000_000, taxCollected: 2_200_000, orderCount: 100 },
  ]
}

// ══════════════════════════════════════════════════════════════════════════
// 1. Monthly tax calculation
// ══════════════════════════════════════════════════════════════════════════

describe('Monthly tax calculation', () => {
  it('calculates DPP correctly from tax-inclusive gross', () => {
    // gross = 11_100_000 → DPP = 10_000_000
    expect(calcDPP(11_100_000)).toBe(10_000_000)
  })

  it('calculates PPN correctly from tax-inclusive gross', () => {
    // PPN = 11_100_000 - 10_000_000 = 1_100_000
    expect(calcPPN(11_100_000)).toBe(1_100_000)
  })

  it('handles zero gross revenue without error', () => {
    expect(calcDPP(0)).toBe(0)
    expect(calcPPN(0)).toBe(0)
  })
})

// ══════════════════════════════════════════════════════════════════════════
// 2. Quarterly aggregation
// ══════════════════════════════════════════════════════════════════════════

describe('Quarterly aggregation', () => {
  it('sums Q1 months (Jan–Mar) correctly', () => {
    const allMonths = buildFullYear(makeSampleRows())
    const q1 = getQuarterRows(allMonths, 1)
    expect(q1).toHaveLength(3)
    const totals = sumRows(q1)
    // Jan: 11_100_000 + Feb: 5_550_000 + Mar: 0
    expect(totals.grossRevenue).toBe(16_650_000)
    expect(totals.taxCollected).toBe(1_650_000)
    expect(totals.orderCount).toBe(75)
  })

  it('Q2–Q3 are zero when no data exists for those months', () => {
    const allMonths = buildFullYear(makeSampleRows())
    const q2 = sumRows(getQuarterRows(allMonths, 2))
    const q3 = sumRows(getQuarterRows(allMonths, 3))
    expect(q2.grossRevenue).toBe(0)
    expect(q3.taxCollected).toBe(0)
  })

  it('Q4 captures December data', () => {
    const allMonths = buildFullYear(makeSampleRows())
    const q4 = sumRows(getQuarterRows(allMonths, 4))
    expect(q4.grossRevenue).toBe(22_200_000)
    expect(q4.taxCollected).toBe(2_200_000)
  })
})

// ══════════════════════════════════════════════════════════════════════════
// 3. Annual totals
// ══════════════════════════════════════════════════════════════════════════

describe('Annual totals', () => {
  it('sums gross revenue across all 12 months', () => {
    const allMonths = buildFullYear(makeSampleRows())
    const totals = sumRows(allMonths)
    expect(totals.grossRevenue).toBe(11_100_000 + 5_550_000 + 22_200_000)
  })

  it('sums tax collected across all 12 months', () => {
    const allMonths = buildFullYear(makeSampleRows())
    const totals = sumRows(allMonths)
    expect(totals.taxCollected).toBe(1_100_000 + 550_000 + 2_200_000)
  })

  it('builds exactly 12 month entries when filling missing months', () => {
    const allMonths = buildFullYear(makeSampleRows())
    expect(allMonths).toHaveLength(12)
    // Months 3–11 (except 12) should be zero
    const march = allMonths.find(r => r.month === 3)!
    expect(march.grossRevenue).toBe(0)
    expect(march.orderCount).toBe(0)
  })
})

// ══════════════════════════════════════════════════════════════════════════
// 4. Tax rate application
// ══════════════════════════════════════════════════════════════════════════

describe('Tax rate application', () => {
  it('effective tax rate on gross is approximately 9.91% (11/111)', () => {
    const gross = 1_000_000
    const ppn = calcPPN(gross)
    const effectiveRate = ppn / gross
    // 11/111 ≈ 0.099099…
    expect(effectiveRate).toBeCloseTo(11 / 111, 4)
  })

  it('DPP + PPN always equals gross', () => {
    const samples = [111_000, 555_000, 11_100_000, 1]
    for (const gross of samples) {
      expect(calcDPP(gross) + calcPPN(gross)).toBe(gross)
    }
  })
})

// ══════════════════════════════════════════════════════════════════════════
// 5. CSV export format
// ══════════════════════════════════════════════════════════════════════════

describe('CSV export format', () => {
  const HEADERS = ['month', 'orderCount', 'grossRevenue', 'taxableRevenue', 'taxCollected']

  it('produces correct header row', () => {
    const csv = buildCSV([], HEADERS)
    const firstLine = csv.split('\n')[0]
    expect(firstLine).toBe('month,orderCount,grossRevenue,taxableRevenue,taxCollected')
  })

  it('produces correct number of lines (header + rows)', () => {
    const rows = [
      { month: 'Januari', orderCount: 50, grossRevenue: 11_100_000, taxableRevenue: 10_000_000, taxCollected: 1_100_000 },
      { month: 'Februari', orderCount: 25, grossRevenue: 5_550_000, taxableRevenue: 5_000_000, taxCollected: 550_000 },
    ]
    const lines = buildCSV(rows, HEADERS).split('\n').filter(Boolean)
    expect(lines).toHaveLength(3) // header + 2 rows
  })

  it('annual total row is included at the end', () => {
    const allMonths = buildFullYear(makeSampleRows())
    const annual = sumRows(allMonths)
    const exportRows = [
      ...allMonths.map(r => ({
        month: `Bulan ${r.month}`,
        orderCount: r.orderCount,
        grossRevenue: r.grossRevenue,
        taxableRevenue: r.taxableRevenue,
        taxCollected: r.taxCollected,
      })),
      {
        month: 'TOTAL',
        orderCount: annual.orderCount,
        grossRevenue: annual.grossRevenue,
        taxableRevenue: annual.taxableRevenue,
        taxCollected: annual.taxCollected,
      },
    ]
    const lines = buildCSV(exportRows, HEADERS).split('\n').filter(Boolean)
    expect(lines).toHaveLength(14) // header + 12 months + 1 total
    const lastLine = lines[lines.length - 1]
    expect(lastLine).toContain('TOTAL')
    expect(lastLine).toContain(String(annual.grossRevenue))
  })
})
