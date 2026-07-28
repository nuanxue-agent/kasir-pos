import { describe, it, expect } from 'vitest'
import {
  generateFakturNumber,
  calcTaxBase,
  calcTaxBaseFromGross,
  calcPPN,
  PPN_RATE,
  nextSeriesNumber,
  seriesMatchesPeriod,
  formatCsvRow,
  buildDjpCsv,
  isValidNpwp,
  formatNpwp,
} from '@/lib/e-faktur'

describe('e-Faktur — Indonesian Tax Invoice Logic', () => {
  // ─── Faktur number generation ───────────────────────────────────────────────
  describe('generateFakturNumber', () => {
    it('formats number as 010.000-YY.XXXXXXXX', () => {
      const result = generateFakturNumber(1, 2024)
      expect(result).toBe('010.000-24.00000001')
    })

    it('zero-pads sequential number to 8 digits', () => {
      expect(generateFakturNumber(42, 2025)).toBe('010.000-25.00000042')
      expect(generateFakturNumber(99999999, 2025)).toBe('010.000-25.99999999')
    })

    it('uses only the last 2 digits of the year', () => {
      expect(generateFakturNumber(1, 2030)).toBe('010.000-30.00000001')
    })

    it('respects custom transaction and status codes', () => {
      expect(generateFakturNumber(5, 2024, '020', '001')).toBe('020.001-24.00000005')
    })
  })

  // ─── Tax base calculation ────────────────────────────────────────────────────
  describe('calcTaxBase', () => {
    it('returns the net amount as tax base (no change)', () => {
      expect(calcTaxBase(1000000)).toBe(1000000)
    })

    it('rounds to 2 decimal places', () => {
      expect(calcTaxBase(333.333)).toBe(333.33)
    })
  })

  describe('calcTaxBaseFromGross', () => {
    it('strips 11% PPN from a gross (tax-inclusive) amount', () => {
      // 1_110_000 gross → 1_000_000 base
      expect(calcTaxBaseFromGross(1_110_000)).toBe(1_000_000)
    })

    it('handles fractional results with rounding', () => {
      const base = calcTaxBaseFromGross(100)
      // 100 / 1.11 ≈ 90.09
      expect(base).toBeCloseTo(90.09, 1)
    })
  })

  // ─── PPN 11% calculation ─────────────────────────────────────────────────────
  describe('calcPPN', () => {
    it('calculates 11% PPN correctly', () => {
      expect(calcPPN(1_000_000)).toBe(110_000)
    })

    it('PPN_RATE constant is 0.11', () => {
      expect(PPN_RATE).toBe(0.11)
    })

    it('rounds to 2 decimal places', () => {
      expect(calcPPN(333.33)).toBeCloseTo(36.67, 1)
    })

    it('returns 0 for zero tax base', () => {
      expect(calcPPN(0)).toBe(0)
    })

    it('taxBase + PPN equals gross (round-trip)', () => {
      const base = calcTaxBaseFromGross(1_110_000)
      const ppn  = calcPPN(base)
      expect(Math.round(base + ppn)).toBe(1_110_000)
    })
  })

  // ─── Series increment logic ──────────────────────────────────────────────────
  describe('nextSeriesNumber', () => {
    it('increments lastNumber by 1', () => {
      const series = { prefix: '010.000', lastNumber: 0, year: 2025, month: 1 }
      expect(nextSeriesNumber(series)).toBe(1)
    })

    it('increments from a non-zero base', () => {
      const series = { prefix: '010.000', lastNumber: 99, year: 2025, month: 3 }
      expect(nextSeriesNumber(series)).toBe(100)
    })
  })

  describe('seriesMatchesPeriod', () => {
    it('returns true when year and month match', () => {
      expect(seriesMatchesPeriod({ prefix: '010.000', lastNumber: 0, year: 2025, month: 7 }, 2025, 7)).toBe(true)
    })

    it('returns false when month differs', () => {
      expect(seriesMatchesPeriod({ prefix: '010.000', lastNumber: 0, year: 2025, month: 6 }, 2025, 7)).toBe(false)
    })

    it('returns false when year differs', () => {
      expect(seriesMatchesPeriod({ prefix: '010.000', lastNumber: 0, year: 2024, month: 7 }, 2025, 7)).toBe(false)
    })
  })

  // ─── CSV export format validation ───────────────────────────────────────────
  describe('formatCsvRow', () => {
    const row = {
      fakturCode: '010.000-25.00000001',
      invoiceNumber: 'INV-001',
      createdAt: '2025-07-15T10:00:00.000Z',
      taxBase: 1_000_000,
      taxAmount: 110_000,
      buyerNpwp: '012345678901234',
      buyerName: 'PT Contoh Maju',
    }

    it('starts with FK indicator', () => {
      expect(formatCsvRow(row).startsWith('FK,')).toBe(true)
    })

    it('formats date as YYYY/MM/DD', () => {
      expect(formatCsvRow(row)).toContain('2025/07/15')
    })

    it('includes all required DJP fields in correct order', () => {
      const csv = formatCsvRow(row)
      const parts = csv.split(',')
      expect(parts[0]).toBe('FK')
      expect(parts[1]).toBe('010.000-25.00000001')
      expect(parts[2]).toBe('2025/07/15')
      expect(parts[3]).toBe('1000000')
      expect(parts[4]).toBe('110000')
      expect(parts[5]).toBe('012345678901234')
      expect(parts[6]).toBe('PT Contoh Maju')
    })
  })

  describe('buildDjpCsv', () => {
    it('includes the mandatory header line as first row', () => {
      const csv = buildDjpCsv([])
      expect(csv.startsWith('JENIS_FAKTUR,')).toBe(true)
    })

    it('produces correct number of lines (header + data rows)', () => {
      const row = {
        fakturCode: '010.000-25.00000001',
        invoiceNumber: 'INV-001',
        createdAt: '2025-07-15T00:00:00.000Z',
        taxBase: 500_000,
        taxAmount: 55_000,
        buyerNpwp: '012345678901234',
        buyerName: 'PT Test',
      }
      const csv = buildDjpCsv([row, row])
      const lines = csv.split('\n')
      expect(lines).toHaveLength(3) // 1 header + 2 data
    })
  })

  // ─── NPWP helpers ────────────────────────────────────────────────────────────
  describe('isValidNpwp', () => {
    it('accepts 15-digit plain string', () => {
      expect(isValidNpwp('012345678901234')).toBe(true)
    })

    it('accepts formatted NPWP with dots and dash', () => {
      expect(isValidNpwp('01.234.567.8-901.234')).toBe(true)
    })

    it('rejects short NPWP', () => {
      expect(isValidNpwp('0123456789')).toBe(false)
    })
  })

  describe('formatNpwp', () => {
    it('formats 15 digits to XX.XXX.XXX.X-XXX.XXX', () => {
      expect(formatNpwp('012345678901234')).toBe('01.234.567.8-901.234')
    })

    it('returns input unchanged if not 15 digits', () => {
      expect(formatNpwp('1234')).toBe('1234')
    })
  })
})
