import { describe, it, expect } from 'vitest'
import {
  calcCurrentRatio,
  calcQuickRatio,
  calcGrossMargin,
  calcNetMargin,
  calcROA,
  calcROE,
  calcInventoryTurnover,
  calcDaysSalesOutstanding,
  computeRatios,
} from '@/lib/financial-ratios'

describe('Financial Ratios', () => {

  describe('Current Ratio', () => {
    it('should calculate current ratio correctly', () => {
      expect(calcCurrentRatio(200_000, 100_000)).toBe(2)
    })
    it('should return 0 when currentLiabilities is zero', () => {
      expect(calcCurrentRatio(100_000, 0)).toBe(0)
    })
    it('should return less than 1 when assets < liabilities', () => {
      expect(calcCurrentRatio(50_000, 100_000)).toBe(0.5)
    })
  })

  describe('Quick Ratio', () => {
    it('should calculate quick ratio excluding inventory', () => {
      expect(calcQuickRatio(200_000, 50_000, 100_000)).toBe(1.5)
    })
    it('should return 0 when currentLiabilities is zero', () => {
      expect(calcQuickRatio(200_000, 50_000, 0)).toBe(0)
    })
    it('should equal current ratio when inventory is zero', () => {
      expect(calcQuickRatio(200_000, 0, 100_000)).toBe(calcCurrentRatio(200_000, 100_000))
    })
  })

  describe('Gross Margin', () => {
    it('should calculate gross margin percentage correctly', () => {
      expect(calcGrossMargin(400_000, 1_000_000)).toBe(40)
    })
    it('should return 0 when revenue is zero', () => {
      expect(calcGrossMargin(50_000, 0)).toBe(0)
    })
    it('should return 100 when grossProfit equals revenue', () => {
      expect(calcGrossMargin(100_000, 100_000)).toBe(100)
    })
  })

  describe('Net Margin', () => {
    it('should calculate net margin percentage correctly', () => {
      expect(calcNetMargin(150_000, 1_000_000)).toBe(15)
    })
    it('should return 0 when revenue is zero', () => {
      expect(calcNetMargin(50_000, 0)).toBe(0)
    })
    it('should handle negative net profit (loss)', () => {
      expect(calcNetMargin(-50_000, 500_000)).toBe(-10)
    })
  })

  describe('ROA', () => {
    it('should calculate return on assets correctly', () => {
      expect(calcROA(100_000, 1_000_000)).toBe(10)
    })
    it('should return 0 when totalAssets is zero', () => {
      expect(calcROA(100_000, 0)).toBe(0)
    })
  })

  describe('ROE', () => {
    it('should calculate return on equity correctly', () => {
      expect(calcROE(200_000, 800_000)).toBe(25)
    })
    it('should return 0 when equity is zero', () => {
      expect(calcROE(200_000, 0)).toBe(0)
    })
  })

  describe('Inventory Turnover', () => {
    it('should calculate inventory turnover correctly', () => {
      expect(calcInventoryTurnover(1_200_000, 200_000)).toBe(6)
    })
    it('should return 0 when inventory is zero', () => {
      expect(calcInventoryTurnover(1_200_000, 0)).toBe(0)
    })
  })

  describe('Days Sales Outstanding', () => {
    it('should calculate DSO correctly', () => {
      expect(calcDaysSalesOutstanding(100_000, 365_000)).toBeCloseTo(100, 1)
    })
    it('should return 0 when revenue is zero', () => {
      expect(calcDaysSalesOutstanding(50_000, 0)).toBe(0)
    })
  })

  describe('computeRatios (full snapshot)', () => {
    it('should compute all ratios from a snapshot', () => {
      const snapshot = {
        id: 'test-1',
        storeId: 'store-1',
        period: '2024-Q1',
        totalAssets: 1_000_000,
        currentAssets: 400_000,
        currentLiabilities: 200_000,
        inventory: 100_000,
        revenue: 2_000_000,
        grossProfit: 800_000,
        netProfit: 200_000,
        equity: 600_000,
        receivables: 150_000,
        computedAt: new Date().toISOString(),
      }
      const ratios = computeRatios(snapshot)
      expect(ratios.currentRatio).toBe(2)
      expect(ratios.quickRatio).toBe(1.5)
      expect(ratios.grossMargin).toBe(40)
      expect(ratios.netMargin).toBe(10)
      expect(ratios.roa).toBe(20)
      expect(ratios.roe).toBeCloseTo(33.33, 1)
      expect(ratios.inventoryTurnover).toBe(20)
      expect(ratios.daysSalesOutstanding).toBeCloseTo(27.375, 1)
    })
  })

})
