import { describe, it, expect } from 'vitest'
import {
  generateLowStockInsights,
  calcRevenueTrend,
  generateRevenueTrendInsight,
  findLowestRevenueHour,
  generateOpportunityInsight,
  generateChurnRiskInsight,
  detectExpenseAnomalies,
  classifyInsightSeverity,
} from '@/app/api/insights/route'

// ── 1. Low stock insight generation ─────────────────────────────────────────

describe('generateLowStockInsights', () => {
  it('generates RECOMMENDATION insight for each product below reorder point', () => {
    const products = [
      { id: 'p1', name: 'Kopi Arabica', stock: 2, reorderPoint: 10 },
      { id: 'p2', name: 'Teh Hijau', stock: 5, reorderPoint: 20 },
    ]
    const insights = generateLowStockInsights(products)
    expect(insights).toHaveLength(2)
    expect(insights[0].type).toBe('RECOMMENDATION')
    expect(insights[0].id).toBe('low-stock-p1')
    expect(insights[0].title).toContain('Kopi Arabica')
  })

  it('assigns CRITICAL severity when stock is 0', () => {
    const products = [{ id: 'p1', name: 'Gula', stock: 0, reorderPoint: 5 }]
    const [insight] = generateLowStockInsights(products)
    expect(insight.severity).toBe('CRITICAL')
  })

  it('assigns WARNING severity when stock is 1–3', () => {
    const products = [{ id: 'p1', name: 'Tepung', stock: 3, reorderPoint: 10 }]
    const [insight] = generateLowStockInsights(products)
    expect(insight.severity).toBe('WARNING')
  })

  it('excludes products at or above reorder point', () => {
    const products = [
      { id: 'p1', name: 'Salt', stock: 10, reorderPoint: 10 },
      { id: 'p2', name: 'Pepper', stock: 15, reorderPoint: 10 },
    ]
    const insights = generateLowStockInsights(products)
    expect(insights).toHaveLength(0)
  })
})

// ── 2. Revenue trend calculation ─────────────────────────────────────────────

describe('calcRevenueTrend', () => {
  it('returns 0 when both weeks have zero revenue', () => {
    expect(calcRevenueTrend(0, 0)).toBe(0)
  })

  it('returns 100 when last week was zero and this week has revenue', () => {
    expect(calcRevenueTrend(500_000, 0)).toBe(100)
  })

  it('calculates positive growth correctly', () => {
    // 1_200_000 vs 1_000_000 = +20%
    expect(calcRevenueTrend(1_200_000, 1_000_000)).toBe(20)
  })

  it('calculates negative decline correctly', () => {
    // 700_000 vs 1_000_000 = -30%
    expect(calcRevenueTrend(700_000, 1_000_000)).toBe(-30)
  })

  it('returns 0 when revenue is identical week-over-week', () => {
    expect(calcRevenueTrend(500_000, 500_000)).toBe(0)
  })
})

describe('generateRevenueTrendInsight', () => {
  it('returns null when both weeks are zero', () => {
    expect(generateRevenueTrendInsight(0, 0)).toBeNull()
  })

  it('produces a TREND insight with positive title for growth', () => {
    const insight = generateRevenueTrendInsight(1_200_000, 1_000_000)
    expect(insight).not.toBeNull()
    expect(insight!.type).toBe('TREND')
    expect(insight!.title).toMatch(/up 20%/)
  })

  it('produces WARNING severity for >10% decline', () => {
    const insight = generateRevenueTrendInsight(800_000, 1_000_000)
    expect(insight!.severity).toBe('WARNING')
  })

  it('produces CRITICAL severity for >30% decline', () => {
    const insight = generateRevenueTrendInsight(600_000, 1_000_000)
    expect(insight!.severity).toBe('CRITICAL')
  })
})

// ── 3. Opportunity hour detection ────────────────────────────────────────────

describe('findLowestRevenueHour', () => {
  it('returns the hour with lowest revenue between 8am and 10pm', () => {
    const data = [
      { hour: 8, revenue: 500_000, count: 5 },
      { hour: 14, revenue: 100_000, count: 1 },
      { hour: 20, revenue: 300_000, count: 3 },
    ]
    const result = findLowestRevenueHour(data)
    expect(result?.hour).toBe(14)
  })

  it('excludes hours before 8am and after 10pm', () => {
    const data = [
      { hour: 3, revenue: 0, count: 0 },   // excluded
      { hour: 23, revenue: 0, count: 0 },  // excluded
      { hour: 10, revenue: 200_000, count: 2 },
    ]
    const result = findLowestRevenueHour(data)
    expect(result?.hour).toBe(10)
  })

  it('returns null for empty data', () => {
    expect(findLowestRevenueHour([])).toBeNull()
  })
})

describe('generateOpportunityInsight', () => {
  it('generates an OPPORTUNITY insight for the lowest revenue hour', () => {
    const data = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      revenue: h >= 8 && h <= 22 ? (h === 15 ? 50_000 : 500_000) : 0,
      count: h === 15 ? 1 : 5,
    }))
    const insight = generateOpportunityInsight(data)
    expect(insight?.type).toBe('OPPORTUNITY')
    expect(insight?.title).toMatch(/3pm/)
  })
})

// ── 4. Churn risk identification ─────────────────────────────────────────────

describe('generateChurnRiskInsight', () => {
  it('returns null when churn count is zero', () => {
    expect(generateChurnRiskInsight(0, 100)).toBeNull()
  })

  it('generates ANOMALY insight when churn customers exist', () => {
    const insight = generateChurnRiskInsight(15, 100)
    expect(insight?.type).toBe('ANOMALY')
    expect(insight?.title).toContain('15')
  })

  it('assigns CRITICAL severity when churn >= 30% of base', () => {
    const insight = generateChurnRiskInsight(35, 100)
    expect(insight?.severity).toBe('CRITICAL')
  })

  it('assigns WARNING severity when churn is 10–29% of base', () => {
    const insight = generateChurnRiskInsight(20, 100)
    expect(insight?.severity).toBe('WARNING')
  })
})

// ── 5. Expense anomaly detection ─────────────────────────────────────────────

describe('detectExpenseAnomalies', () => {
  it('detects categories with >30% increase month-over-month', () => {
    const thisMonth = [{ category: 'Packaging', total: 1_400_000 }]
    const lastMonth = [{ category: 'Packaging', total: 1_000_000 }]
    const insights = detectExpenseAnomalies(thisMonth, lastMonth)
    expect(insights).toHaveLength(1)
    expect(insights[0].type).toBe('ANOMALY')
    expect(insights[0].title).toContain('Packaging')
    expect(insights[0].title).toContain('40%')
  })

  it('ignores categories with <=30% increase', () => {
    const thisMonth = [{ category: 'Electricity', total: 1_300_000 }]
    const lastMonth = [{ category: 'Electricity', total: 1_000_000 }]
    const insights = detectExpenseAnomalies(thisMonth, lastMonth)
    expect(insights).toHaveLength(0)
  })

  it('ignores new categories with no prior month data', () => {
    const thisMonth = [{ category: 'NewCat', total: 500_000 }]
    const lastMonth: { category: string; total: number }[] = []
    const insights = detectExpenseAnomalies(thisMonth, lastMonth)
    expect(insights).toHaveLength(0)
  })

  it('assigns CRITICAL severity when category is up >=60%', () => {
    const thisMonth = [{ category: 'Rent', total: 2_000_000 }]
    const lastMonth = [{ category: 'Rent', total: 1_000_000 }]
    const [insight] = detectExpenseAnomalies(thisMonth, lastMonth)
    expect(insight.severity).toBe('CRITICAL')
  })
})

// ── 6. Insight severity classification ───────────────────────────────────────

describe('classifyInsightSeverity', () => {
  it('RECOMMENDATION with stock=0 is CRITICAL', () => {
    expect(classifyInsightSeverity('RECOMMENDATION', 0)).toBe('CRITICAL')
  })

  it('RECOMMENDATION with stock 1–3 is WARNING', () => {
    expect(classifyInsightSeverity('RECOMMENDATION', 2)).toBe('WARNING')
  })

  it('RECOMMENDATION with stock >3 is INFO', () => {
    expect(classifyInsightSeverity('RECOMMENDATION', 5)).toBe('INFO')
  })

  it('ANOMALY with value >=60 is CRITICAL', () => {
    expect(classifyInsightSeverity('ANOMALY', 60)).toBe('CRITICAL')
  })

  it('ANOMALY with value 30–59 is WARNING', () => {
    expect(classifyInsightSeverity('ANOMALY', 45)).toBe('WARNING')
  })

  it('TREND with value <=-30 is CRITICAL', () => {
    expect(classifyInsightSeverity('TREND', -30)).toBe('CRITICAL')
  })

  it('TREND with value -10 to -29 is WARNING', () => {
    expect(classifyInsightSeverity('TREND', -15)).toBe('WARNING')
  })

  it('OPPORTUNITY always returns INFO', () => {
    expect(classifyInsightSeverity('OPPORTUNITY', 0)).toBe('INFO')
    expect(classifyInsightSeverity('OPPORTUNITY', 100)).toBe('INFO')
  })
})
