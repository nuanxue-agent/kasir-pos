import { describe, it, expect } from 'vitest'
import {
  calcProjectedBalance,
  applyScenarioDelta,
  calcRunningBalance,
  calcVariance,
  calcVariancePct,
  isLiquidityWarning,
  getScenarioDeltas,
} from '@/app/api/cash-flow-forecast/generate/route'

describe('Cash Flow Forecast', () => {

  // ── 1. Projected balance calculation ──────────────────────────────────────

  describe('calcProjectedBalance', () => {
    it('should compute opening + inflow - outflow', () => {
      expect(calcProjectedBalance(10_000, 5_000, 3_000)).toBe(12_000)
    })

    it('should return negative balance when outflow exceeds opening + inflow', () => {
      expect(calcProjectedBalance(1_000, 500, 2_000)).toBe(-500)
    })

    it('should handle zero opening balance', () => {
      expect(calcProjectedBalance(0, 8_000, 8_000)).toBe(0)
    })
  })

  // ── 2. Liquidity threshold detection ──────────────────────────────────────

  describe('isLiquidityWarning', () => {
    it('should flag balance below threshold', () => {
      expect(isLiquidityWarning(4_999, 5_000)).toBe(true)
    })

    it('should not flag balance equal to threshold', () => {
      expect(isLiquidityWarning(5_000, 5_000)).toBe(false)
    })

    it('should not flag balance above threshold', () => {
      expect(isLiquidityWarning(10_000, 5_000)).toBe(false)
    })

    it('should flag negative balance when threshold is zero', () => {
      expect(isLiquidityWarning(-1, 0)).toBe(true)
    })
  })

  // ── 3. Best / base / worst scenario deltas ────────────────────────────────

  describe('applyScenarioDelta', () => {
    it('should apply +20% for best scenario', () => {
      expect(applyScenarioDelta(100_000, 'best')).toBeCloseTo(120_000)
    })

    it('should return unchanged value for base scenario', () => {
      expect(applyScenarioDelta(100_000, 'base')).toBe(100_000)
    })

    it('should apply -20% for worst scenario', () => {
      expect(applyScenarioDelta(100_000, 'worst')).toBeCloseTo(80_000)
    })
  })

  describe('getScenarioDeltas', () => {
    it('should produce correct inflow/outflow for all three scenarios', () => {
      const deltas = getScenarioDeltas(10_000, 6_000)
      // best: inflow +20%, outflow -20%
      expect(deltas.best.inflow).toBeCloseTo(12_000)
      expect(deltas.best.outflow).toBeCloseTo(4_800)
      // base: unchanged
      expect(deltas.base.inflow).toBe(10_000)
      expect(deltas.base.outflow).toBe(6_000)
      // worst: inflow -20%, outflow +20%
      expect(deltas.worst.inflow).toBeCloseTo(8_000)
      expect(deltas.worst.outflow).toBeCloseTo(7_200)
    })

    it('should respect custom deltaFactor', () => {
      const deltas = getScenarioDeltas(10_000, 5_000, 0.1)
      expect(deltas.best.inflow).toBeCloseTo(11_000)
      expect(deltas.worst.outflow).toBeCloseTo(5_500)
    })
  })

  // ── 4. Running balance calculation ────────────────────────────────────────

  describe('calcRunningBalance', () => {
    it('should compute cumulative running balance across multiple days', () => {
      const rows = [
        { projectedInflow: 5_000, projectedOutflow: 3_000 },
        { projectedInflow: 4_000, projectedOutflow: 2_000 },
        { projectedInflow: 6_000, projectedOutflow: 4_000 },
      ]
      // opening=10k: day1=12k, day2=14k, day3=16k
      expect(calcRunningBalance(rows, 10_000)).toEqual([12_000, 14_000, 16_000])
    })

    it('should handle empty rows', () => {
      expect(calcRunningBalance([], 5_000)).toEqual([])
    })

    it('should reflect deficit days in running balance', () => {
      const rows = [
        { projectedInflow: 1_000, projectedOutflow: 5_000 },
      ]
      expect(calcRunningBalance(rows, 3_000)).toEqual([-1_000])
    })
  })

  // ── 5. Variance (actual vs projected) ─────────────────────────────────────

  describe('calcVariance', () => {
    it('should return positive variance when actual > projected', () => {
      expect(calcVariance(8_000, 10_000)).toBe(2_000)
    })

    it('should return negative variance when actual < projected', () => {
      expect(calcVariance(10_000, 7_000)).toBe(-3_000)
    })

    it('should return zero when actual equals projected', () => {
      expect(calcVariance(5_000, 5_000)).toBe(0)
    })
  })

  describe('calcVariancePct', () => {
    it('should compute percentage variance correctly', () => {
      expect(calcVariancePct(10_000, 12_000)).toBeCloseTo(20)
    })

    it('should return 0 when both projected and actual are zero', () => {
      expect(calcVariancePct(0, 0)).toBe(0)
    })

    it('should return Infinity when projected is zero but actual is non-zero', () => {
      expect(calcVariancePct(0, 1_000)).toBe(Infinity)
    })
  })
})
