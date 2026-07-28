import { describe, it, expect } from 'vitest'
import {
  calcTotalCost,
  calcCostVariance,
  calcCostVariancePct,
  isFavorableVariance,
  calcGrossMargin,
  calcGrossMarginPct,
  calcMarkup,
  allocateOverhead,
  calcOverheadRate,
  calcCostPerUnit,
  calcCOGS,
  calcBudgetVariance,
  calcBudgetUtilizationPct,
  isBudgetOverrun,
} from '@/lib/cost-accounting'

describe('Cost Accounting', () => {

  describe('Total cost calculation', () => {
    it('should sum material, labor, and overhead costs', () => {
      expect(calcTotalCost({ materialCost: 5000, laborCost: 2000, overheadCost: 1000 })).toBe(8000)
    })
    it('should return zero when all costs are zero', () => {
      expect(calcTotalCost({ materialCost: 0, laborCost: 0, overheadCost: 0 })).toBe(0)
    })
  })

  describe('Cost variance', () => {
    it('should return positive variance when actual < standard (favorable)', () => {
      expect(calcCostVariance({ standardCost: 10000, actualCost: 8000 })).toBe(2000)
    })
    it('should return negative variance when actual > standard (unfavorable)', () => {
      expect(calcCostVariance({ standardCost: 8000, actualCost: 9500 })).toBe(-1500)
    })
    it('should return variance percentage correctly', () => {
      expect(calcCostVariancePct({ standardCost: 10000, actualCost: 8000 })).toBe(20)
    })
    it('should return 0 variance pct when standard cost is zero', () => {
      expect(calcCostVariancePct({ standardCost: 0, actualCost: 500 })).toBe(0)
    })
    it('should classify favorable vs unfavorable variance', () => {
      expect(isFavorableVariance(2000)).toBe(true)
      expect(isFavorableVariance(-1500)).toBe(false)
      expect(isFavorableVariance(0)).toBe(true)
    })
  })

  describe('Margin from cost', () => {
    it('should calculate gross margin correctly', () => {
      expect(calcGrossMargin(15000, 8000)).toBe(7000)
    })
    it('should calculate gross margin percentage', () => {
      expect(calcGrossMarginPct(15000, 8000)).toBeCloseTo(46.67, 1)
    })
    it('should return 0 margin pct when selling price is zero', () => {
      expect(calcGrossMarginPct(0, 5000)).toBe(0)
    })
    it('should calculate markup over cost', () => {
      expect(calcMarkup(8000, 15000)).toBeCloseTo(87.5, 1)
    })
    it('should return 0 markup when cost is zero', () => {
      expect(calcMarkup(0, 15000)).toBe(0)
    })
  })

  describe('Overhead allocation', () => {
    it('should allocate overhead proportionally by direct cost', () => {
      // product direct = 7000, total direct = 35000, total overhead = 10000
      // allocation = (7000/35000) * 10000 = 2000
      expect(allocateOverhead(7000, 35000, 10000)).toBe(2000)
    })
    it('should return 0 when total direct costs are zero', () => {
      expect(allocateOverhead(5000, 0, 10000)).toBe(0)
    })
    it('should calculate overhead rate as percentage of direct costs', () => {
      expect(calcOverheadRate(10000, 50000)).toBe(20)
    })
    it('should return 0 overhead rate when total direct costs are zero', () => {
      expect(calcOverheadRate(5000, 0)).toBe(0)
    })
  })

  describe('Cost per unit', () => {
    it('should calculate cost per unit correctly', () => {
      expect(calcCostPerUnit(80000, 100)).toBe(800)
    })
    it('should return 0 when units is zero', () => {
      expect(calcCostPerUnit(80000, 0)).toBe(0)
    })
    it('should calculate COGS from cost per unit and units sold', () => {
      expect(calcCOGS(800, 75)).toBe(60000)
    })
  })

  describe('Budget variance for cost centers', () => {
    it('should calculate budget variance correctly', () => {
      expect(calcBudgetVariance({ budget: 50000, actualCost: 42000 })).toBe(8000)
    })
    it('should calculate budget utilization percentage', () => {
      expect(calcBudgetUtilizationPct({ budget: 50000, actualCost: 42000 })).toBe(84)
    })
    it('should detect budget overrun', () => {
      expect(isBudgetOverrun({ budget: 50000, actualCost: 52000 })).toBe(true)
      expect(isBudgetOverrun({ budget: 50000, actualCost: 42000 })).toBe(false)
    })
  })

})
