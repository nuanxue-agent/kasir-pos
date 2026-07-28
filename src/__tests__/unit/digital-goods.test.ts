import { describe, it, expect } from 'vitest'
import {
  calcMarginAmount,
  calcSellingPrice,
  isValidSerialNumber,
  isValidStatusTransition,
  aggregateSalesByCategory,
  aggregateDailySales,
  type SaleStatus,
} from '@/app/api/digital-sales/route'

describe('Digital Goods Module', () => {
  // ── Margin calculation ───────────────────────────────────────────────────

  describe('Margin calculation', () => {
    it('should calculate margin amount correctly', () => {
      expect(calcMarginAmount(10000, 10)).toBe(1000)
      expect(calcMarginAmount(50000, 5)).toBe(2500)
      expect(calcMarginAmount(20000, 15)).toBe(3000)
    })

    it('should return 0 for zero or negative price', () => {
      expect(calcMarginAmount(0, 10)).toBe(0)
      expect(calcMarginAmount(-100, 10)).toBe(0)
    })

    it('should calculate selling price correctly', () => {
      expect(calcSellingPrice(10000, 10)).toBe(11000)
      expect(calcSellingPrice(50000, 5)).toBe(52500)
      expect(calcSellingPrice(20000, 15)).toBe(23000)
    })

    it('should return 0 for zero or negative denomination', () => {
      expect(calcSellingPrice(0, 10)).toBe(0)
      expect(calcSellingPrice(-100, 10)).toBe(0)
    })
  })

  // ── Serial number validation ─────────────────────────────────────────────

  describe('Serial number validation', () => {
    it('should accept valid serial numbers', () => {
      expect(isValidSerialNumber('ABC12345')).toBe(true)
      expect(isValidSerialNumber('XYZABC1234567890')).toBe(true)
      expect(isValidSerialNumber('12345678')).toBe(true)
      expect(isValidSerialNumber('ABCD1234EFGH5678IJKL9012MNOP')).toBe(true) // 28 chars
    })

    it('should reject invalid serial numbers', () => {
      expect(isValidSerialNumber('')).toBe(false)
      expect(isValidSerialNumber('   ')).toBe(false)
      expect(isValidSerialNumber('ABC123')).toBe(false) // too short
      expect(isValidSerialNumber('abc12345')).toBe(false) // lowercase
      expect(isValidSerialNumber('ABC-1234')).toBe(false) // special char
      expect(isValidSerialNumber('ABC 1234')).toBe(false) // space
      expect(isValidSerialNumber('A'.repeat(33))).toBe(false) // too long (33 chars)
    })
  })

  // ── Category filtering ───────────────────────────────────────────────────

  describe('Category filtering', () => {
    it('should aggregate sales by category', () => {
      const sales = [
        { category: 'TOPUP', price: 10000, status: 'SUCCESS' as SaleStatus },
        { category: 'TOPUP', price: 20000, status: 'SUCCESS' as SaleStatus },
        { category: 'EVOUCHER', price: 50000, status: 'SUCCESS' as SaleStatus },
        { category: 'TOPUP', price: 15000, status: 'FAILED' as SaleStatus }, // should be excluded
      ]
      const result = aggregateSalesByCategory(sales)
      expect(result.TOPUP).toEqual({ count: 2, revenue: 30000 })
      expect(result.EVOUCHER).toEqual({ count: 1, revenue: 50000 })
      expect(result.GAME_CREDIT).toBeUndefined()
    })

    it('should return empty object for empty sales', () => {
      expect(aggregateSalesByCategory([])).toEqual({})
    })
  })

  // ── Sale status transitions ──────────────────────────────────────────────

  describe('Sale status transitions', () => {
    it('should allow PENDING → SUCCESS', () => {
      expect(isValidStatusTransition('PENDING', 'SUCCESS')).toBe(true)
    })

    it('should allow PENDING → FAILED', () => {
      expect(isValidStatusTransition('PENDING', 'FAILED')).toBe(true)
    })

    it('should allow FAILED → PENDING (retry)', () => {
      expect(isValidStatusTransition('FAILED', 'PENDING')).toBe(true)
    })

    it('should not allow SUCCESS → PENDING', () => {
      expect(isValidStatusTransition('SUCCESS', 'PENDING')).toBe(false)
    })

    it('should not allow SUCCESS → FAILED', () => {
      expect(isValidStatusTransition('SUCCESS', 'FAILED')).toBe(false)
    })

    it('should not allow FAILED → SUCCESS directly', () => {
      expect(isValidStatusTransition('FAILED', 'SUCCESS')).toBe(false)
    })
  })

  // ── Daily sales aggregation ──────────────────────────────────────────────

  describe('Daily sales aggregation', () => {
    it('should aggregate sales by day', () => {
      const sales = [
        { createdAt: '2025-01-15T10:00:00Z', price: 10000, status: 'SUCCESS' as SaleStatus },
        { createdAt: '2025-01-15T14:00:00Z', price: 20000, status: 'SUCCESS' as SaleStatus },
        { createdAt: '2025-01-16T09:00:00Z', price: 50000, status: 'SUCCESS' as SaleStatus },
        { createdAt: '2025-01-15T16:00:00Z', price: 15000, status: 'PENDING' as SaleStatus }, // excluded
      ]
      const result = aggregateDailySales(sales)
      expect(result['2025-01-15']).toEqual({ count: 2, revenue: 30000 })
      expect(result['2025-01-16']).toEqual({ count: 1, revenue: 50000 })
    })

    it('should handle multiple successful sales on same day', () => {
      const sales = [
        { createdAt: '2025-01-10T08:00:00Z', price: 5000, status: 'SUCCESS' as SaleStatus },
        { createdAt: '2025-01-10T10:00:00Z', price: 7000, status: 'SUCCESS' as SaleStatus },
        { createdAt: '2025-01-10T15:00:00Z', price: 3000, status: 'SUCCESS' as SaleStatus },
      ]
      const result = aggregateDailySales(sales)
      expect(result['2025-01-10']).toEqual({ count: 3, revenue: 15000 })
    })

    it('should return empty object for empty sales', () => {
      expect(aggregateDailySales([])).toEqual({})
    })
  })
})
