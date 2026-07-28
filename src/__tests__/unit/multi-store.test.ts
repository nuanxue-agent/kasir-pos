import { describe, it, expect } from 'vitest'

// ── Types ──────────────────────────────────────────────────────────────────────

type Metric = 'REVENUE' | 'TRANSACTIONS' | 'NEW_CUSTOMERS'

interface StoreSummary {
  storeId: string
  storeName: string
  revenue: number
  transactions: number
  avgOrder: number
  topProduct: string | null
  stockShortage: number
  newCustomers: number
}

interface StoreRankingInput {
  storeId: string
  storeName: string
  revenue: number
  transactions: number
  prevRevenue: number
}

interface RankedStore extends StoreRankingInput {
  growth: number
  rank: number
}

interface StoreTarget {
  id: string
  storeId: string
  metric: Metric
  targetValue: number
  period: string
  actualValue: number
}

// ── Pure business-logic functions ──────────────────────────────────────────────

/** Calculate growth rate % between two periods */
function calcGrowthRate(current: number, previous: number): number {
  if (previous <= 0) return 0
  return Math.round(((current - previous) / previous) * 100 * 100) / 100
}

/** Rank stores by a given metric */
function rankStores(
  stores: StoreRankingInput[],
  metric: 'revenue' | 'transactions' | 'growth',
): RankedStore[] {
  const withGrowth: RankedStore[] = stores.map((s) => ({
    ...s,
    growth: calcGrowthRate(s.revenue, s.prevRevenue),
    rank: 0,
  }))

  if (metric === 'transactions') {
    withGrowth.sort((a, b) => b.transactions - a.transactions)
  } else if (metric === 'growth') {
    withGrowth.sort((a, b) => b.growth - a.growth)
  } else {
    withGrowth.sort((a, b) => b.revenue - a.revenue)
  }

  return withGrowth.map((s, i) => ({ ...s, rank: i + 1 }))
}

/** Calculate target achievement percentage (capped at 100) */
function calcAchievement(actual: number, target: number): number {
  if (target <= 0) return 0
  return Math.min(Math.round((actual / target) * 100), 100)
}

/** Compare revenues: returns difference and which store leads */
function compareRevenue(
  a: StoreSummary,
  b: StoreSummary,
): { diff: number; leader: string; pctDiff: number } {
  const diff    = a.revenue - b.revenue
  const leader  = diff >= 0 ? a.storeId : b.storeId
  const base    = Math.max(a.revenue, b.revenue)
  const pctDiff = base > 0 ? Math.round((Math.abs(diff) / base) * 100) : 0
  return { diff: Math.abs(diff), leader, pctDiff }
}

/** Detect performance outliers (>1.5 std-devs from mean) */
function detectOutliers(stores: StoreSummary[]): StoreSummary[] {
  if (stores.length < 2) return []
  const revenues = stores.map((s) => s.revenue)
  const mean     = revenues.reduce((a, b) => a + b, 0) / revenues.length
  const variance = revenues.reduce((a, b) => a + (b - mean) ** 2, 0) / revenues.length
  const stddev   = Math.sqrt(variance)
  return stores.filter((s) => Math.abs(s.revenue - mean) > 1.5 * stddev)
}

/** Total revenue across all stores */
function totalRevenue(stores: StoreSummary[]): number {
  return stores.reduce((s, r) => s + r.revenue, 0)
}

/** Validate a store target before insertion */
function validateTarget(t: Partial<StoreTarget>): string | null {
  if (!t.storeId) return 'storeId required'
  const validMetrics: Metric[] = ['REVENUE', 'TRANSACTIONS', 'NEW_CUSTOMERS']
  if (!t.metric || !validMetrics.includes(t.metric)) return 'Invalid metric'
  if (typeof t.targetValue !== 'number' || t.targetValue < 0) return 'targetValue must be non-negative'
  if (!t.period) return 'period required'
  return null
}

// ── Tests ──────────────────────────────────────────────────────────────────────

const sampleStores: StoreSummary[] = [
  { storeId: 'A', storeName: 'Toko A', revenue: 10_000_000, transactions: 200, avgOrder: 50_000, topProduct: 'Kopi', stockShortage: 0, newCustomers: 30 },
  { storeId: 'B', storeName: 'Toko B', revenue:  6_000_000, transactions: 120, avgOrder: 50_000, topProduct: 'Teh',  stockShortage: 3, newCustomers: 15 },
  { storeId: 'C', storeName: 'Toko C', revenue:  2_000_000, transactions:  40, avgOrder: 50_000, topProduct: null,   stockShortage: 0, newCustomers: 5  },
]

describe('Store ranking calculation', () => {
  it('ranks stores by revenue descending', () => {
    const inputs: StoreRankingInput[] = sampleStores.map((s) => ({
      ...s, prevRevenue: s.revenue * 0.9,
    }))
    const ranked = rankStores(inputs, 'revenue')
    expect(ranked[0].storeId).toBe('A')
    expect(ranked[1].storeId).toBe('B')
    expect(ranked[2].storeId).toBe('C')
    expect(ranked[0].rank).toBe(1)
    expect(ranked[2].rank).toBe(3)
  })

  it('ranks stores by transactions descending', () => {
    const inputs: StoreRankingInput[] = sampleStores.map((s) => ({
      ...s, prevRevenue: 0,
    }))
    const ranked = rankStores(inputs, 'transactions')
    expect(ranked[0].storeId).toBe('A')
    expect(ranked[0].transactions).toBe(200)
  })

  it('ranks stores by growth rate descending', () => {
    const inputs: StoreRankingInput[] = [
      { storeId: 'A', storeName: 'A', revenue: 12_000_000, transactions: 200, prevRevenue: 10_000_000 }, // +20%
      { storeId: 'B', storeName: 'B', revenue:  7_000_000, transactions: 120, prevRevenue:  5_000_000 }, // +40%
      { storeId: 'C', storeName: 'C', revenue:  2_000_000, transactions:  40, prevRevenue:  3_000_000 }, // -33%
    ]
    const ranked = rankStores(inputs, 'growth')
    expect(ranked[0].storeId).toBe('B')  // highest growth
    expect(ranked[2].storeId).toBe('C')  // negative growth
  })
})

describe('Growth rate calculation', () => {
  it('calculates positive growth correctly', () => {
    expect(calcGrowthRate(12_000_000, 10_000_000)).toBe(20)
  })

  it('calculates negative growth correctly', () => {
    expect(calcGrowthRate(8_000_000, 10_000_000)).toBe(-20)
  })

  it('returns 0 when previous period is zero', () => {
    expect(calcGrowthRate(5_000_000, 0)).toBe(0)
  })
})

describe('Target achievement percentage', () => {
  it('calculates full achievement at 100%', () => {
    expect(calcAchievement(1_000_000, 1_000_000)).toBe(100)
  })

  it('calculates partial achievement', () => {
    expect(calcAchievement(750_000, 1_000_000)).toBe(75)
  })

  it('caps achievement at 100% even when exceeded', () => {
    expect(calcAchievement(1_500_000, 1_000_000)).toBe(100)
  })

  it('returns 0 when target is zero', () => {
    expect(calcAchievement(500_000, 0)).toBe(0)
  })
})

describe('Revenue comparison', () => {
  it('identifies correct leader', () => {
    const result = compareRevenue(sampleStores[0], sampleStores[1])
    expect(result.leader).toBe('A')
    expect(result.diff).toBe(4_000_000)
  })

  it('computes percentage difference', () => {
    const result = compareRevenue(sampleStores[0], sampleStores[1])
    // diff = 4M, base = 10M → 40%
    expect(result.pctDiff).toBe(40)
  })

  it('sums total revenue across all stores', () => {
    expect(totalRevenue(sampleStores)).toBe(18_000_000)
  })
})

describe('Outlier detection', () => {
  it('detects high outlier correctly', () => {
    // 5 stores: A at 10M, others ~100K → mean≈2.08M, stddev≈3.96M, 1.5×sd≈5.94M
    // A's deviation = 7.92M > 5.94M → confirmed outlier
    const stores: StoreSummary[] = [
      { ...sampleStores[0], storeId: 'A', revenue: 10_000_000 },
      { ...sampleStores[1], storeId: 'B', revenue:    100_000 },
      { ...sampleStores[2], storeId: 'C', revenue:    120_000 },
      { storeId: 'D', storeName: 'D', revenue: 110_000, transactions: 10, avgOrder: 11_000, topProduct: null, stockShortage: 0, newCustomers: 2 },
      { storeId: 'E', storeName: 'E', revenue:  90_000, transactions:  8, avgOrder: 11_250, topProduct: null, stockShortage: 0, newCustomers: 1 },
    ]
    const outliers = detectOutliers(stores)
    expect(outliers.some((s) => s.storeId === 'A')).toBe(true)
  })

  it('returns empty array when all stores are close in revenue', () => {
    const stores: StoreSummary[] = [
      { ...sampleStores[0], revenue: 5_000_000 },
      { ...sampleStores[1], revenue: 5_100_000 },
      { ...sampleStores[2], revenue: 4_900_000 },
    ]
    expect(detectOutliers(stores)).toHaveLength(0)
  })

  it('returns empty array for fewer than 2 stores', () => {
    expect(detectOutliers([sampleStores[0]])).toHaveLength(0)
  })
})

describe('Target validation', () => {
  it('accepts a valid target', () => {
    expect(validateTarget({ storeId: 'A', metric: 'REVENUE', targetValue: 10_000_000, period: '2025-07' })).toBeNull()
  })

  it('rejects missing storeId', () => {
    expect(validateTarget({ metric: 'REVENUE', targetValue: 1_000_000, period: '2025-07' })).toBe('storeId required')
  })

  it('rejects invalid metric', () => {
    expect(validateTarget({ storeId: 'A', metric: 'PROFIT' as Metric, targetValue: 1_000_000, period: '2025-07' })).toBe('Invalid metric')
  })

  it('rejects negative targetValue', () => {
    expect(validateTarget({ storeId: 'A', metric: 'TRANSACTIONS', targetValue: -1, period: '2025-07' })).toBe('targetValue must be non-negative')
  })
})
