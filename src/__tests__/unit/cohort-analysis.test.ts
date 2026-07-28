import { describe, it, expect } from 'vitest'
import {
  calcRetentionRate,
  toCohortMonth,
  periodOffset,
  calcLTVByCohort,
  calcChurnRates,
  normalizeHeatmap,
  groupIntoCohorts,
  buildCohortGrid,
  type RawOrder,
  type CohortRow,
} from '@/lib/cohort-analysis'

describe('Cohort Analysis', () => {
  // --- 1. Retention rate calculation ---
  describe('calcRetentionRate', () => {
    it('returns correct percentage', () => {
      expect(calcRetentionRate(80, 100)).toBe(80)
    })

    it('returns 0 when cohort size is zero', () => {
      expect(calcRetentionRate(5, 0)).toBe(0)
    })

    it('clamps to 100 when retained exceeds cohort size (data anomaly)', () => {
      expect(calcRetentionRate(120, 100)).toBe(100)
    })

    it('returns 0 when no one is retained', () => {
      expect(calcRetentionRate(0, 50)).toBe(0)
    })
  })

  // --- 2. Cohort month grouping ---
  describe('toCohortMonth', () => {
    it('extracts YYYY-MM from ISO date', () => {
      expect(toCohortMonth('2024-03-15T10:00:00.000Z')).toBe('2024-03')
    })

    it('handles month boundaries correctly', () => {
      expect(toCohortMonth('2024-12-01T00:00:00.000Z')).toBe('2024-12')
    })

    it('pads single-digit months', () => {
      expect(toCohortMonth('2024-01-20T12:00:00.000Z')).toBe('2024-01')
    })
  })

  describe('periodOffset', () => {
    it('returns 0 for same month', () => {
      expect(periodOffset('2024-01', '2024-01')).toBe(0)
    })

    it('returns correct offset across months', () => {
      expect(periodOffset('2024-01', '2024-04')).toBe(3)
    })

    it('crosses year boundary correctly', () => {
      expect(periodOffset('2024-11', '2025-02')).toBe(3)
    })
  })

  // --- 3. Cohort grouping from raw orders ---
  describe('groupIntoCohorts', () => {
    const orders: RawOrder[] = [
      { customerId: 'c1', createdAt: '2024-01-10T00:00:00Z', revenue: 100 },
      { customerId: 'c1', createdAt: '2024-02-15T00:00:00Z', revenue: 150 },
      { customerId: 'c2', createdAt: '2024-01-20T00:00:00Z', revenue: 200 },
      { customerId: 'c3', createdAt: '2024-02-05T00:00:00Z', revenue: 80 },
    ]

    it('groups customers by their first order month', () => {
      const rows = groupIntoCohorts(orders)
      const jan = rows.filter(r => r.cohortMonth === '2024-01')
      expect(jan.length).toBeGreaterThan(0)
      // c1 and c2 acquired in Jan
      const janOffset0 = jan.find(r => r.periodOffset === 0)
      expect(janOffset0?.customers).toBe(2)
    })

    it('tracks retention at offset 1 for returning customers', () => {
      const rows = groupIntoCohorts(orders)
      const janM1 = rows.find(r => r.cohortMonth === '2024-01' && r.periodOffset === 1)
      // Only c1 returned in Feb from Jan cohort
      expect(janM1?.retained).toBe(1)
    })
  })

  // --- 4. LTV computation ---
  describe('calcLTVByCohort', () => {
    const rows: CohortRow[] = [
      { cohortMonth: '2024-01', periodOffset: 0, customers: 10, retained: 10, retentionRate: 100, revenue: 5000 },
      { cohortMonth: '2024-01', periodOffset: 1, customers: 10, retained: 7, retentionRate: 70, revenue: 3500 },
      { cohortMonth: '2024-02', periodOffset: 0, customers: 5, retained: 5, retentionRate: 100, revenue: 2000 },
    ]

    it('calculates LTV as cumulative revenue / customers', () => {
      const ltv = calcLTVByCohort(rows)
      const jan = ltv.find(r => r.cohortMonth === '2024-01')
      expect(jan?.ltv).toBe(850) // (5000 + 3500) / 10
    })

    it('returns 0 LTV when no customers', () => {
      const ltv = calcLTVByCohort([
        { cohortMonth: '2024-03', periodOffset: 0, customers: 0, retained: 0, retentionRate: 0, revenue: 0 },
      ])
      expect(ltv[0].ltv).toBe(0)
    })

    it('computes avgMonthlyRevenue correctly', () => {
      const ltv = calcLTVByCohort(rows)
      const jan = ltv.find(r => r.cohortMonth === '2024-01')
      // 2 periods, LTV = 850, avgMonthly = 850 / 2 = 425
      expect(jan?.avgMonthlyRevenue).toBe(425)
    })
  })

  // --- 5. Churn rate ---
  describe('calcChurnRates', () => {
    it('churn = 100 - retentionRate', () => {
      const rows: CohortRow[] = [
        { cohortMonth: '2024-01', periodOffset: 1, customers: 10, retained: 7, retentionRate: 70, revenue: 0 },
      ]
      const churn = calcChurnRates(rows)
      expect(churn[0].churnRate).toBe(30)
    })

    it('returns 0 churn for 100% retention', () => {
      const rows: CohortRow[] = [
        { cohortMonth: '2024-01', periodOffset: 0, customers: 10, retained: 10, retentionRate: 100, revenue: 0 },
      ]
      expect(calcChurnRates(rows)[0].churnRate).toBe(0)
    })

    it('clamps churn to 100 for anomalous data', () => {
      const rows: CohortRow[] = [
        { cohortMonth: '2024-01', periodOffset: 2, customers: 10, retained: 0, retentionRate: 0, revenue: 0 },
      ]
      expect(calcChurnRates(rows)[0].churnRate).toBe(100)
    })
  })

  // --- 6. Heatmap normalization ---
  describe('normalizeHeatmap', () => {
    it('normalizes values to 0–1 range', () => {
      const rows: CohortRow[] = [
        { cohortMonth: '2024-01', periodOffset: 0, customers: 10, retained: 10, retentionRate: 100, revenue: 0 },
        { cohortMonth: '2024-01', periodOffset: 1, customers: 10, retained: 5, retentionRate: 50, revenue: 0 },
        { cohortMonth: '2024-01', periodOffset: 2, customers: 10, retained: 2, retentionRate: 20, revenue: 0 },
      ]
      const result = normalizeHeatmap(rows)
      const vals = result.map(r => r.normalized)
      expect(Math.max(...vals)).toBe(1)
      expect(Math.min(...vals)).toBe(0)
    })

    it('returns 0 normalized for all-zero retention', () => {
      const rows: CohortRow[] = [
        { cohortMonth: '2024-01', periodOffset: 0, customers: 0, retained: 0, retentionRate: 0, revenue: 0 },
      ]
      const result = normalizeHeatmap(rows)
      expect(result[0].normalized).toBe(0)
    })

    it('returns 1 for single non-zero row', () => {
      const rows: CohortRow[] = [
        { cohortMonth: '2024-01', periodOffset: 0, customers: 10, retained: 10, retentionRate: 80, revenue: 0 },
      ]
      const result = normalizeHeatmap(rows)
      expect(result[0].normalized).toBe(1)
    })
  })

  // --- 7. Grid builder ---
  describe('buildCohortGrid', () => {
    it('builds cohorts and periods arrays', () => {
      const rows: CohortRow[] = [
        { cohortMonth: '2024-01', periodOffset: 0, customers: 10, retained: 10, retentionRate: 100, revenue: 0 },
        { cohortMonth: '2024-01', periodOffset: 1, customers: 10, retained: 7, retentionRate: 70, revenue: 0 },
        { cohortMonth: '2024-02', periodOffset: 0, customers: 5, retained: 5, retentionRate: 100, revenue: 0 },
      ]
      const grid = buildCohortGrid(rows)
      expect(grid.cohorts).toEqual(['2024-01', '2024-02'])
      expect(grid.periods).toEqual([0, 1])
    })

    it('cell lookup is correct', () => {
      const rows: CohortRow[] = [
        { cohortMonth: '2024-03', periodOffset: 2, customers: 8, retained: 4, retentionRate: 50, revenue: 1000 },
      ]
      const grid = buildCohortGrid(rows)
      expect(grid.cells['2024-03'][2].retentionRate).toBe(50)
    })
  })
})
