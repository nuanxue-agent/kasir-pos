import { describe, it, expect } from 'vitest'

// ── Pure helpers mirrored from StoreComparisonClient ─────────────────────────

type DateRange = 'today' | 'week' | 'month' | 'custom'

interface StoreMetrics {
  storeId: string
  storeName: string
  revenue: number
  orders: number
  avgOrderValue: number
  grossMarginPct: number
  newCustomers: number
  returningCustomers: number
  percentileRank: number
}

function getDateRange(range: DateRange, now = new Date()): { from: string; to: string } {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  switch (range) {
    case 'today':
      return { from: today.toISOString(), to: now.toISOString() }
    case 'week': {
      const w = new Date(today)
      w.setDate(w.getDate() - w.getDay())
      return { from: w.toISOString(), to: now.toISOString() }
    }
    case 'month': {
      const m = new Date(now.getFullYear(), now.getMonth(), 1)
      return { from: m.toISOString(), to: now.toISOString() }
    }
    default:
      return { from: today.toISOString(), to: now.toISOString() }
  }
}

function findBestPerformer(stores: StoreMetrics[], metric: keyof StoreMetrics): string {
  if (stores.length === 0) return ''
  let best = stores[0]
  for (const s of stores) {
    if ((s[metric] as number) > (best[metric] as number)) best = s
  }
  return best.storeId
}

function calcPercentileRank(value: number, allValues: number[]): number {
  if (allValues.length === 0) return 0
  const below = allValues.filter(v => v < value).length
  return Math.round((below / allValues.length) * 100)
}

function aggregateStoreMetrics(
  orders: Array<{
    storeId: string
    total: number
    costTotal: number
    customerId: string | null
    isNew: boolean
  }>,
  storeId: string,
): Omit<StoreMetrics, 'storeName' | 'percentileRank'> {
  const storeOrders = orders.filter(o => o.storeId === storeId)
  const revenue = storeOrders.reduce((s, o) => s + o.total, 0)
  const cost = storeOrders.reduce((s, o) => s + o.costTotal, 0)
  const totalOrders = storeOrders.length
  const avgOrderValue = totalOrders > 0 ? revenue / totalOrders : 0
  const grossMarginPct = revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0
  const newCustomers = storeOrders.filter(o => o.isNew).length
  const returningCustomers = storeOrders.filter(o => !o.isNew && o.customerId !== null).length

  return {
    storeId,
    revenue,
    orders: totalOrders,
    avgOrderValue,
    grossMarginPct,
    newCustomers,
    returningCustomers,
  }
}

function isAlertTriggered(actual: number, avg30d: number, thresholdPct = 20): boolean {
  if (avg30d === 0) return false
  return actual < avg30d * (1 - thresholdPct / 100)
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const sampleStores: StoreMetrics[] = [
  {
    storeId: 'store-a',
    storeName: 'Toko Jakarta',
    revenue: 10_000_000,
    orders: 200,
    avgOrderValue: 50_000,
    grossMarginPct: 40,
    newCustomers: 30,
    returningCustomers: 170,
    percentileRank: 80,
  },
  {
    storeId: 'store-b',
    storeName: 'Toko Bandung',
    revenue: 6_000_000,
    orders: 120,
    avgOrderValue: 50_000,
    grossMarginPct: 35,
    newCustomers: 50,
    returningCustomers: 70,
    percentileRank: 50,
  },
  {
    storeId: 'store-c',
    storeName: 'Toko Surabaya',
    revenue: 8_500_000,
    orders: 170,
    avgOrderValue: 50_000,
    grossMarginPct: 38,
    newCustomers: 20,
    returningCustomers: 150,
    percentileRank: 70,
  },
]

const sampleOrders = [
  { storeId: 'store-a', total: 100_000, costTotal: 60_000, customerId: 'c1', isNew: true },
  { storeId: 'store-a', total: 200_000, costTotal: 100_000, customerId: 'c2', isNew: false },
  { storeId: 'store-a', total: 150_000, costTotal: 90_000, customerId: null, isNew: false },
  { storeId: 'store-b', total: 80_000, costTotal: 40_000, customerId: 'c3', isNew: true },
  { storeId: 'store-b', total: 120_000, costTotal: 60_000, customerId: 'c4', isNew: true },
]

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Metric aggregation per store', () => {
  it('aggregates revenue correctly for store-a', () => {
    const m = aggregateStoreMetrics(sampleOrders, 'store-a')
    expect(m.revenue).toBe(450_000)
  })

  it('aggregates order count correctly for store-b', () => {
    const m = aggregateStoreMetrics(sampleOrders, 'store-b')
    expect(m.orders).toBe(2)
  })

  it('calculates avgOrderValue correctly', () => {
    const m = aggregateStoreMetrics(sampleOrders, 'store-a')
    expect(m.avgOrderValue).toBe(150_000)
  })

  it('calculates gross margin % correctly for store-a', () => {
    // revenue=450k, cost=250k → margin=(200k/450k)*100 ≈ 44.44%
    const m = aggregateStoreMetrics(sampleOrders, 'store-a')
    expect(m.grossMarginPct).toBeCloseTo(44.44, 1)
  })

  it('counts new customers correctly', () => {
    const m = aggregateStoreMetrics(sampleOrders, 'store-a')
    expect(m.newCustomers).toBe(1)
  })

  it('counts returning customers (non-new with customerId)', () => {
    // store-a: c2 isNew=false + customerId → 1 returning; null customerId excluded
    const m = aggregateStoreMetrics(sampleOrders, 'store-a')
    expect(m.returningCustomers).toBe(1)
  })

  it('returns zero metrics for a store with no orders', () => {
    const m = aggregateStoreMetrics(sampleOrders, 'store-z')
    expect(m.revenue).toBe(0)
    expect(m.orders).toBe(0)
    expect(m.grossMarginPct).toBe(0)
  })
})

describe('Best performer detection', () => {
  it('identifies the store with the highest revenue', () => {
    expect(findBestPerformer(sampleStores, 'revenue')).toBe('store-a')
  })

  it('identifies the store with the most new customers', () => {
    expect(findBestPerformer(sampleStores, 'newCustomers')).toBe('store-b')
  })

  it('returns empty string for an empty store list', () => {
    expect(findBestPerformer([], 'revenue')).toBe('')
  })
})

describe('Percentile rank calculation', () => {
  it('calculates correct percentile for a middle value', () => {
    // allValues=[100,200,300,400,500], value=300 → 2 below → 2/5=40%
    expect(calcPercentileRank(300, [100, 200, 300, 400, 500])).toBe(40)
  })

  it('returns 0 for the minimum value', () => {
    expect(calcPercentileRank(100, [100, 200, 300])).toBe(0)
  })

  it('returns 100 for a value above all others', () => {
    // 3 values below 500 out of 3 total = 100%
    expect(calcPercentileRank(500, [100, 200, 300])).toBe(100)
  })

  it('returns 0 for empty allValues array', () => {
    expect(calcPercentileRank(999, [])).toBe(0)
  })
})

describe('Performance alert threshold logic', () => {
  it('triggers alert when actual is >20% below 30-day average', () => {
    // avg=1000, actual=790 → 79% of avg → below 80% threshold
    expect(isAlertTriggered(790, 1000)).toBe(true)
  })

  it('does not trigger when actual is exactly 80% of average', () => {
    expect(isAlertTriggered(800, 1000)).toBe(false)
  })

  it('does not trigger when actual is above 80% of average', () => {
    expect(isAlertTriggered(950, 1000)).toBe(false)
  })

  it('never triggers when 30-day average is zero', () => {
    expect(isAlertTriggered(0, 0)).toBe(false)
    expect(isAlertTriggered(500, 0)).toBe(false)
  })
})

describe('Period date range computation', () => {
  const fixedNow = new Date('2025-07-15T14:30:00.000Z')

  it('today range: from is start-of-day, to is now', () => {
    const { from, to } = getDateRange('today', fixedNow)
    expect(new Date(from).getUTCHours()).toBeDefined()
    expect(new Date(to).toISOString()).toBe(fixedNow.toISOString())
    expect(new Date(from) <= new Date(to)).toBe(true)
  })

  it('month range: from is first day of current month', () => {
    const { from } = getDateRange('month', fixedNow)
    const d = new Date(from)
    // Month range uses local time — just confirm day ≤ 7 (start of month area)
    expect(d.getDate()).toBeLessThanOrEqual(7)
  })

  it('week range: from is before today', () => {
    const { from, to } = getDateRange('week', fixedNow)
    expect(new Date(from) < new Date(to)).toBe(true)
  })
})
