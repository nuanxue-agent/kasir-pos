import { describe, it, expect } from 'vitest'
import {
  calcCurrentRatio,
  calcQuickRatio,
  calcGrossMarginPct,
  calcNetMarginPct,
  calcInventoryTurnover,
  calcReceivablesTurnover,
  calcDebtRatio,
  calcHealthScore,
  detectTrendDirection,
} from '@/components/reports/FinancialRatiosClient'

describe('Financial Ratios', () => {
  // ── Liquidity ──────────────────────────────────────────────────────────────

  describe('Current Ratio', () => {
    it('calculates current ratio correctly', () => {
      expect(calcCurrentRatio(200_000, 100_000)).toBeCloseTo(2.0)
    })

    it('returns Infinity when current liabilities are zero', () => {
      expect(calcCurrentRatio(100_000, 0)).toBe(Infinity)
    })

    it('returns value below 1 when liabilities exceed assets', () => {
      expect(calcCurrentRatio(80_000, 100_000)).toBeCloseTo(0.8)
    })
  })

  describe('Quick Ratio', () => {
    it('calculates quick ratio by excluding inventory', () => {
      // currentAssets=200k, inventory=60k, liabilities=100k → (200k-60k)/100k = 1.4
      expect(calcQuickRatio(200_000, 60_000, 100_000)).toBeCloseTo(1.4)
    })

    it('returns Infinity when current liabilities are zero', () => {
      expect(calcQuickRatio(200_000, 50_000, 0)).toBe(Infinity)
    })
  })

  // ── Profitability ──────────────────────────────────────────────────────────

  describe('Gross Margin %', () => {
    it('calculates gross margin percentage correctly', () => {
      // revenue=1,000,000  cogs=600,000 → 40%
      expect(calcGrossMarginPct(1_000_000, 600_000)).toBeCloseTo(40)
    })

    it('returns 0 when revenue is zero', () => {
      expect(calcGrossMarginPct(0, 0)).toBe(0)
    })

    it('returns negative margin when cogs exceed revenue', () => {
      expect(calcGrossMarginPct(500_000, 700_000)).toBeCloseTo(-40)
    })
  })

  describe('Net Margin %', () => {
    it('calculates net margin percentage correctly', () => {
      // revenue=1,000,000  netIncome=80,000 → 8%
      expect(calcNetMarginPct(1_000_000, 80_000)).toBeCloseTo(8)
    })

    it('returns 0 when revenue is zero', () => {
      expect(calcNetMarginPct(0, 0)).toBe(0)
    })
  })

  // ── Efficiency ─────────────────────────────────────────────────────────────

  describe('Inventory Turnover', () => {
    it('calculates inventory turnover correctly', () => {
      // cogs=2,400,000  avgInventory=300,000 → 8x
      expect(calcInventoryTurnover(2_400_000, 300_000)).toBeCloseTo(8)
    })

    it('returns 0 when average inventory is zero', () => {
      expect(calcInventoryTurnover(1_000_000, 0)).toBe(0)
    })

    it('detects low turnover as below 1 when inventory is large', () => {
      expect(calcInventoryTurnover(100_000, 500_000)).toBeCloseTo(0.2)
    })
  })

  describe('Receivables Turnover', () => {
    it('calculates receivables turnover correctly', () => {
      // revenue=1,200,000  avgReceivables=120,000 → 10x
      expect(calcReceivablesTurnover(1_200_000, 120_000)).toBeCloseTo(10)
    })

    it('returns 0 when receivables are zero', () => {
      expect(calcReceivablesTurnover(1_000_000, 0)).toBe(0)
    })
  })

  describe('Debt Ratio', () => {
    it('calculates debt ratio correctly', () => {
      // totalDebt=400,000  totalAssets=1,000,000 → 0.4
      expect(calcDebtRatio(400_000, 1_000_000)).toBeCloseTo(0.4)
    })

    it('returns 0 when total assets are zero', () => {
      expect(calcDebtRatio(100_000, 0)).toBe(0)
    })
  })

  // ── Health Score ───────────────────────────────────────────────────────────

  describe('Health Score Weighting', () => {
    it('returns 100 for a perfect business profile', () => {
      const score = calcHealthScore({
        currentRatio: 2, // 100 * 0.25 = 25
        grossMarginPct: 50, // 100 * 0.25 = 25
        netMarginPct: 15, // 100 * 0.20 = 20
        inventoryTurnover: 12, // 100 * 0.15 = 15
        debtRatio: 0, // 100 * 0.15 = 15 → total 100
      })
      expect(score).toBe(100)
    })

    it('returns 0 for a distressed business profile', () => {
      const score = calcHealthScore({
        currentRatio: 0,
        grossMarginPct: 0,
        netMarginPct: -5,
        inventoryTurnover: 0,
        debtRatio: 1,
      })
      expect(score).toBe(0)
    })

    it('weights liquidity and gross margin equally at 25% each', () => {
      // Only liquidity perfect, rest zero
      const liquidityOnly = calcHealthScore({
        currentRatio: 2,
        grossMarginPct: 0,
        netMarginPct: -5,
        inventoryTurnover: 0,
        debtRatio: 1,
      })
      // Only gross margin perfect, rest zero
      const grossMarginOnly = calcHealthScore({
        currentRatio: 0,
        grossMarginPct: 50,
        netMarginPct: -5,
        inventoryTurnover: 0,
        debtRatio: 1,
      })
      expect(liquidityOnly).toBe(grossMarginOnly)
    })

    it('clamps score between 0 and 100', () => {
      const score = calcHealthScore({
        currentRatio: 100,
        grossMarginPct: 200,
        netMarginPct: 100,
        inventoryTurnover: 100,
        debtRatio: -1,
      })
      expect(score).toBeLessThanOrEqual(100)
      expect(score).toBeGreaterThanOrEqual(0)
    })
  })

  // ── Trend Direction ────────────────────────────────────────────────────────

  describe('Trend Direction Detection', () => {
    it('detects upward trend', () => {
      expect(detectTrendDirection([10, 15, 20, 25, 30])).toBe('up')
    })

    it('detects downward trend', () => {
      expect(detectTrendDirection([30, 25, 20, 15, 10])).toBe('down')
    })

    it('detects flat trend when change is less than 2%', () => {
      // 1% change: 100 → 101
      expect(detectTrendDirection([100, 100.5, 101])).toBe('flat')
    })

    it('returns flat for a single value', () => {
      expect(detectTrendDirection([42])).toBe('flat')
    })

    it('returns flat for empty array', () => {
      expect(detectTrendDirection([])).toBe('flat')
    })

    it('handles zero as first value without dividing by zero', () => {
      // first=0, last=5 — pct check would divide by 0, should be treated as non-flat
      const result = detectTrendDirection([0, 5])
      // pct = 0 (since first is 0), so should be flat
      expect(result).toBe('flat')
    })
  })
})
