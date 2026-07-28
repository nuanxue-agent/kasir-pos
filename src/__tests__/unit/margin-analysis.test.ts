import { describe, it, expect } from 'vitest'
import {
  calcGrossMargin,
  calcGrossMarginPct,
  calcContributionMargin,
  calcBreakEvenUnits,
  calcMarginPct,
  calcWhatIfDelta,
} from '@/components/reports/MarginAnalysisClient'

describe('Margin Analysis Calculations', () => {
  describe('calcGrossMargin', () => {
    it('should calculate gross margin correctly', () => {
      expect(calcGrossMargin(1000, 600)).toBe(400)
      expect(calcGrossMargin(5000, 3000)).toBe(2000)
      expect(calcGrossMargin(0, 0)).toBe(0)
    })

    it('should handle negative margins', () => {
      expect(calcGrossMargin(500, 700)).toBe(-200)
    })
  })

  describe('calcGrossMarginPct', () => {
    it('should calculate gross margin percentage correctly', () => {
      expect(calcGrossMarginPct(1000, 600)).toBe(40)
      expect(calcGrossMarginPct(5000, 3000)).toBe(40)
      expect(calcGrossMarginPct(1000, 250)).toBe(75)
    })

    it('should handle zero revenue', () => {
      expect(calcGrossMarginPct(0, 100)).toBe(0)
      expect(calcGrossMarginPct(0, 0)).toBe(0)
    })

    it('should handle negative margins', () => {
      expect(calcGrossMarginPct(500, 700)).toBe(-40)
    })
  })

  describe('calcContributionMargin', () => {
    it('should calculate contribution margin correctly', () => {
      expect(calcContributionMargin(10000, 6000, 2000)).toBe(2000)
      expect(calcContributionMargin(5000, 2000, 1000)).toBe(2000)
    })

    it('should handle zero fixed costs', () => {
      expect(calcContributionMargin(5000, 3000, 0)).toBe(2000)
    })

    it('should handle negative contribution margin', () => {
      expect(calcContributionMargin(5000, 4000, 2000)).toBe(-1000)
    })
  })

  describe('calcBreakEvenUnits', () => {
    it('should calculate break-even units correctly', () => {
      expect(calcBreakEvenUnits(10000, 100, 60)).toBe(250)
      expect(calcBreakEvenUnits(5000, 50, 30)).toBe(250)
      expect(calcBreakEvenUnits(12000, 150, 90)).toBe(200)
    })

    it('should return Infinity when contribution margin is zero or negative', () => {
      expect(calcBreakEvenUnits(1000, 50, 50)).toBe(Infinity)
      expect(calcBreakEvenUnits(1000, 50, 60)).toBe(Infinity)
    })

    it('should handle zero fixed costs', () => {
      expect(calcBreakEvenUnits(0, 100, 60)).toBe(0)
    })
  })

  describe('calcMarginPct', () => {
    it('should calculate margin percentage correctly', () => {
      expect(calcMarginPct(1000, 600)).toBe(40)
      expect(calcMarginPct(2000, 1000)).toBe(50)
    })

    it('should handle zero revenue', () => {
      expect(calcMarginPct(0, 0)).toBe(0)
    })
  })

  describe('calcWhatIfDelta', () => {
    it('should calculate what-if scenario delta correctly', () => {
      const result = calcWhatIfDelta(10000, 6000, 120, 60, 100)
      expect(result.oldMargin).toBe(4000)
      expect(result.newMargin).toBe(6000)
      expect(result.delta).toBe(2000)
      expect(result.deltaPct).toBe(50)
    })

    it('should handle price increase scenario', () => {
      const result = calcWhatIfDelta(5000, 3000, 60, 30, 100)
      expect(result.oldMargin).toBe(2000)
      expect(result.newMargin).toBe(3000)
      expect(result.delta).toBe(1000)
      expect(result.deltaPct).toBe(50)
    })

    it('should handle cost reduction scenario', () => {
      const result = calcWhatIfDelta(10000, 6000, 100, 50, 100)
      expect(result.oldMargin).toBe(4000)
      expect(result.newMargin).toBe(5000)
      expect(result.delta).toBe(1000)
      expect(result.deltaPct).toBe(25)
    })

    it('should handle negative delta', () => {
      const result = calcWhatIfDelta(10000, 6000, 80, 60, 100)
      expect(result.oldMargin).toBe(4000)
      expect(result.newMargin).toBe(2000)
      expect(result.delta).toBe(-2000)
      expect(result.deltaPct).toBe(-50)
    })

    it('should handle zero old margin', () => {
      const result = calcWhatIfDelta(5000, 5000, 60, 40, 100)
      expect(result.oldMargin).toBe(0)
      expect(result.newMargin).toBe(2000)
      expect(result.delta).toBe(2000)
      expect(result.deltaPct).toBe(0)
    })

    it('should handle complex scenario with multiple changes', () => {
      const result = calcWhatIfDelta(15000, 9000, 180, 90, 100)
      expect(result.oldMargin).toBe(6000)
      expect(result.newMargin).toBe(9000)
      expect(result.delta).toBe(3000)
      expect(result.deltaPct).toBe(50)
    })
  })
})
