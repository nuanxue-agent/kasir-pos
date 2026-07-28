import { describe, it, expect } from 'vitest'
import {
  calcCommission,
  calcVendorPayment,
  calcTotalCost,
  calcUnsoldQty,
  calcUnsettledQty,
  isoWeekLabel,
  monthLabel,
  periodLabel,
  generatePeriods,
  isValidTransition,
  isContractActive,
} from '@/lib/consignment'
import type { ConsignmentItem, ContractStatus } from '@/lib/consignment'

const makeItem = (overrides: Partial<ConsignmentItem> = {}): ConsignmentItem => ({
  id: 'ci1',
  contractId: 'cc1',
  storeId: 's1',
  productId: 'p1',
  qty: 100,
  costPrice: 50000,
  soldQty: 40,
  settledQty: 20,
  ...overrides,
})

describe('Consignment', () => {

  // ── Commission calculation ───────────────────────────────────────────────
  describe('calcCommission', () => {
    it('calculates 10% commission correctly', () => {
      expect(calcCommission(1_000_000, 10)).toBe(100_000)
    })

    it('calculates 0% commission as zero', () => {
      expect(calcCommission(500_000, 0)).toBe(0)
    })

    it('calculates 100% commission returns full amount', () => {
      expect(calcCommission(200_000, 100)).toBe(200_000)
    })

    it('throws on negative commissionRate', () => {
      expect(() => calcCommission(100_000, -1)).toThrow(RangeError)
    })

    it('throws on commissionRate above 100', () => {
      expect(() => calcCommission(100_000, 101)).toThrow(RangeError)
    })
  })

  // ── Settlement amount calculation ─────────────────────────────────────────
  describe('calcVendorPayment', () => {
    it('returns totalCost minus commission for vendor', () => {
      // 15% commission on 1,000,000 → vendor gets 850,000
      expect(calcVendorPayment(1_000_000, 15)).toBe(850_000)
    })

    it('returns full amount when commission is 0%', () => {
      expect(calcVendorPayment(300_000, 0)).toBe(300_000)
    })
  })

  describe('calcTotalCost', () => {
    it('multiplies soldQty by costPrice', () => {
      expect(calcTotalCost(20, 50_000)).toBe(1_000_000)
    })

    it('returns 0 for zero soldQty', () => {
      expect(calcTotalCost(0, 99_000)).toBe(0)
    })
  })

  // ── Unsold stock tracking ─────────────────────────────────────────────────
  describe('calcUnsoldQty', () => {
    it('returns remaining stock not yet sold', () => {
      const item = makeItem({ qty: 100, soldQty: 40 })
      expect(calcUnsoldQty(item)).toBe(60)
    })

    it('returns 0 when all stock is sold', () => {
      const item = makeItem({ qty: 50, soldQty: 50 })
      expect(calcUnsoldQty(item)).toBe(0)
    })

    it('never returns negative (oversold guard)', () => {
      const item = makeItem({ qty: 10, soldQty: 15 })
      expect(calcUnsoldQty(item)).toBe(0)
    })
  })

  describe('calcUnsettledQty', () => {
    it('returns sold units not yet settled', () => {
      const item = makeItem({ soldQty: 40, settledQty: 20 })
      expect(calcUnsettledQty(item)).toBe(20)
    })

    it('returns 0 when all sold are settled', () => {
      const item = makeItem({ soldQty: 30, settledQty: 30 })
      expect(calcUnsettledQty(item)).toBe(0)
    })
  })

  // ── Settlement period generation ──────────────────────────────────────────
  describe('periodLabel', () => {
    it('returns ISO week label for WEEKLY', () => {
      // 2026-07-28 is in week 31
      const label = periodLabel(new Date('2026-07-28'), 'WEEKLY')
      expect(label).toMatch(/^\d{4}-W\d{2}$/)
      expect(label).toBe('2026-W31')
    })

    it('returns YYYY-MM label for MONTHLY', () => {
      const label = periodLabel(new Date('2026-07-28'), 'MONTHLY')
      expect(label).toBe('2026-07')
    })
  })

  describe('generatePeriods', () => {
    it('generates correct monthly periods for a quarter', () => {
      const periods = generatePeriods('2026-01-01', '2026-03-31', 'MONTHLY')
      expect(periods).toEqual(['2026-01', '2026-02', '2026-03'])
    })

    it('generates weekly periods for a short range', () => {
      const periods = generatePeriods('2026-07-06', '2026-07-20', 'WEEKLY')
      // Week starting 2026-07-06 (W28), 2026-07-13 (W29), 2026-07-20 (W30)
      expect(periods.length).toBeGreaterThanOrEqual(2)
      periods.forEach(p => expect(p).toMatch(/^\d{4}-W\d{2}$/))
    })

    it('returns single period when start equals end', () => {
      const periods = generatePeriods('2026-06-01', '2026-06-01', 'MONTHLY')
      expect(periods).toEqual(['2026-06'])
    })
  })

  // ── Contract status transitions ───────────────────────────────────────────
  describe('isValidTransition', () => {
    it('allows ACTIVE → TERMINATED', () => {
      expect(isValidTransition('ACTIVE', 'TERMINATED')).toBe(true)
    })

    it('disallows TERMINATED → ACTIVE', () => {
      expect(isValidTransition('TERMINATED', 'ACTIVE')).toBe(false)
    })

    it('disallows ACTIVE → ACTIVE (no-op is invalid)', () => {
      expect(isValidTransition('ACTIVE', 'ACTIVE')).toBe(false)
    })
  })

  describe('isContractActive', () => {
    it('returns true for ACTIVE contract', () => {
      expect(isContractActive({ status: 'ACTIVE' })).toBe(true)
    })

    it('returns false for TERMINATED contract', () => {
      expect(isContractActive({ status: 'TERMINATED' })).toBe(false)
    })
  })

})
