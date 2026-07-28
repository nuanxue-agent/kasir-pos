import { describe, it, expect } from 'vitest'
import {
  isContractValid,
  isContractExpiringSoon,
  deriveContractStatus,
  isPriceLineActive,
  getPriceLinesForProduct,
  selectBestPrice,
  meetsMinOrderQty,
  calcPriceSavings,
  getExpiringContracts,
} from '@/lib/supplier-contracts'
import type { SupplierContract, ContractPriceLine } from '@/lib/supplier-contracts'

const makeContract = (overrides: Partial<SupplierContract> = {}): SupplierContract => ({
  id: 'c1',
  storeId: 's1',
  vendorId: 'v1',
  contractNumber: 'CTR-001',
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  paymentTerms: 'NET30',
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...overrides,
})

const makePriceLine = (overrides: Partial<ContractPriceLine> = {}): ContractPriceLine => ({
  id: 'pl1',
  contractId: 'c1',
  storeId: 's1',
  productId: 'p1',
  unitPrice: 8000,
  minOrderQty: 10,
  validFrom: '2026-01-01',
  validTo: '2026-12-31',
  ...overrides,
})

describe('Supplier Contracts', () => {
  // ── Contract validity ────────────────────────────────────────────────
  describe('isContractValid', () => {
    it('returns true for ACTIVE contract within date range', () => {
      const c = makeContract({ status: 'ACTIVE' })
      expect(isContractValid(c, new Date('2026-06-15'))).toBe(true)
    })

    it('returns false for DRAFT contract even within date range', () => {
      const c = makeContract({ status: 'DRAFT' })
      expect(isContractValid(c, new Date('2026-06-15'))).toBe(false)
    })

    it('returns false for ACTIVE contract before start date', () => {
      const c = makeContract({ status: 'ACTIVE', startDate: '2026-06-01' })
      expect(isContractValid(c, new Date('2026-05-01'))).toBe(false)
    })

    it('returns false for ACTIVE contract after end date', () => {
      const c = makeContract({ status: 'ACTIVE', endDate: '2026-03-31' })
      expect(isContractValid(c, new Date('2026-06-01'))).toBe(false)
    })
  })

  // ── Expiry detection ─────────────────────────────────────────────────
  describe('isContractExpiringSoon', () => {
    it('detects contract expiring within 30 days', () => {
      const c = makeContract({ status: 'ACTIVE', endDate: '2026-08-10' })
      expect(isContractExpiringSoon(c, 30, new Date('2026-07-28'))).toBe(true)
    })

    it('does not flag contract expiring more than 30 days away', () => {
      const c = makeContract({ status: 'ACTIVE', endDate: '2026-12-31' })
      expect(isContractExpiringSoon(c, 30, new Date('2026-07-28'))).toBe(false)
    })

    it('does not flag already EXPIRED contract', () => {
      const c = makeContract({ status: 'EXPIRED', endDate: '2026-07-01' })
      expect(isContractExpiringSoon(c, 30, new Date('2026-07-28'))).toBe(false)
    })

    it('does not flag TERMINATED contract', () => {
      const c = makeContract({ status: 'TERMINATED', endDate: '2026-08-10' })
      expect(isContractExpiringSoon(c, 30, new Date('2026-07-28'))).toBe(false)
    })
  })

  describe('getExpiringContracts', () => {
    it('returns only contracts expiring within threshold', () => {
      const soon = makeContract({ id: 'c1', status: 'ACTIVE', endDate: '2026-08-05' })
      const later = makeContract({ id: 'c2', status: 'ACTIVE', endDate: '2026-12-31' })
      const result = getExpiringContracts([soon, later], 30, new Date('2026-07-28'))
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('c1')
    })
  })

  // ── Price line lookup ─────────────────────────────────────────────────
  describe('getPriceLinesForProduct', () => {
    it('returns active price lines for the product', () => {
      const line = makePriceLine({ productId: 'p1' })
      const result = getPriceLinesForProduct([line], 'p1', new Date('2026-06-15'))
      expect(result).toHaveLength(1)
    })

    it('excludes expired price lines', () => {
      const line = makePriceLine({ productId: 'p1', validTo: '2026-03-31' })
      const result = getPriceLinesForProduct([line], 'p1', new Date('2026-06-15'))
      expect(result).toHaveLength(0)
    })

    it('excludes lines for other products', () => {
      const line = makePriceLine({ productId: 'p2' })
      const result = getPriceLinesForProduct([line], 'p1', new Date('2026-06-15'))
      expect(result).toHaveLength(0)
    })
  })

  // ── Best price selection ──────────────────────────────────────────────
  describe('selectBestPrice', () => {
    it('returns the cheapest eligible price line', () => {
      const cheap = makePriceLine({ id: 'pl1', contractId: 'c1', unitPrice: 7500, minOrderQty: 5 })
      const pricey = makePriceLine({ id: 'pl2', contractId: 'c2', unitPrice: 9000, minOrderQty: 1 })
      const result = selectBestPrice([cheap, pricey], 'p1', 10, 10000, new Date('2026-06-15'))
      expect(result).not.toBeNull()
      expect(result!.unitPrice).toBe(7500)
    })

    it('returns null when no lines meet the minimum order quantity', () => {
      const line = makePriceLine({ unitPrice: 7500, minOrderQty: 50 })
      const result = selectBestPrice([line], 'p1', 10, 10000, new Date('2026-06-15'))
      expect(result).toBeNull()
    })

    it('calculates savings correctly vs standard price', () => {
      const line = makePriceLine({ unitPrice: 8000, minOrderQty: 1 })
      const result = selectBestPrice([line], 'p1', 10, 10000, new Date('2026-06-15'))
      expect(result!.savings).toBe(2000)
      expect(result!.savingsPct).toBeCloseTo(20)
    })
  })

  // ── Min order quantity enforcement ───────────────────────────────────
  describe('meetsMinOrderQty', () => {
    it('returns true when qty meets the minimum', () => {
      const line = makePriceLine({ minOrderQty: 10 })
      expect(meetsMinOrderQty(line, 10)).toBe(true)
      expect(meetsMinOrderQty(line, 20)).toBe(true)
    })

    it('returns false when qty is below the minimum', () => {
      const line = makePriceLine({ minOrderQty: 10 })
      expect(meetsMinOrderQty(line, 5)).toBe(false)
      expect(meetsMinOrderQty(line, 9)).toBe(false)
    })
  })

  // ── calcPriceSavings ──────────────────────────────────────────────────
  describe('calcPriceSavings', () => {
    it('calculates positive savings when contract price is lower', () => {
      const { savings, savingsPct } = calcPriceSavings(8000, 10000)
      expect(savings).toBe(2000)
      expect(savingsPct).toBeCloseTo(20)
    })

    it('returns 0 savings pct when standard price is 0', () => {
      const { savings, savingsPct } = calcPriceSavings(0, 0)
      expect(savings).toBe(0)
      expect(savingsPct).toBe(0)
    })
  })

  // ── deriveContractStatus ──────────────────────────────────────────────
  describe('deriveContractStatus', () => {
    it('marks ACTIVE contract as EXPIRED after end date', () => {
      const c = makeContract({ status: 'ACTIVE', endDate: '2026-01-31' })
      expect(deriveContractStatus(c, new Date('2026-03-01'))).toBe('EXPIRED')
    })

    it('leaves DRAFT status unchanged regardless of dates', () => {
      const c = makeContract({ status: 'DRAFT', startDate: '2026-01-01', endDate: '2026-12-31' })
      expect(deriveContractStatus(c, new Date('2026-06-15'))).toBe('DRAFT')
    })

    it('leaves TERMINATED status unchanged', () => {
      const c = makeContract({ status: 'TERMINATED', endDate: '2026-12-31' })
      expect(deriveContractStatus(c, new Date('2026-06-15'))).toBe('TERMINATED')
    })
  })
})
