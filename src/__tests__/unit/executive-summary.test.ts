import { describe, it, expect } from 'vitest'

// ─── Types ────────────────────────────────────────────────────────────────────

type AlertSeverity = 'critical' | 'warning' | 'info'
type AlertType = 'low_stock' | 'overdue_invoice' | 'pending_approval' | 'expiring_contract'
type TrendDirection = 'up' | 'down' | 'flat'

interface DailyTrend {
  date: string
  revenue: number
  transactions: number
  avgOrderValue: number
}

interface RankingItem {
  id: string
  name: string
  revenue: number
  unitsSold?: number
  orderCount?: number
}

interface Alert {
  id: string
  type: AlertType
  severity: AlertSeverity
  title: string
  message: string
  entityId?: string
  entityName?: string
  amount?: number
  createdAt: string
  daysOverdue?: number
  daysLeft?: number
  currentStock?: number
  reorderPoint?: number
}

// ─── Pure helper functions (mirrors API/component logic) ─────────────────────

function calculateRevenueGrowth(current: number, previous: number): number {
  if (previous === 0) return 0
  return ((current - previous) / previous) * 100
}

function calculateProfitMargin(revenue: number, cogs: number): number {
  if (revenue === 0) return 0
  return ((revenue - cogs) / revenue) * 100
}

function classifyAlertSeverity(type: AlertType, context: {
  daysOverdue?: number
  daysLeft?: number
  currentStock?: number
}): AlertSeverity {
  switch (type) {
    case 'low_stock':
      return (context.currentStock ?? 1) === 0 ? 'critical' : 'warning'
    case 'overdue_invoice':
      return (context.daysOverdue ?? 0) > 30 ? 'critical' : 'warning'
    case 'pending_approval':
      return 'info'
    case 'expiring_contract':
      return (context.daysLeft ?? 31) <= 7 ? 'critical' : 'warning'
  }
}

function aggregateTrendPeriod(trends: DailyTrend[]): {
  totalRevenue: number
  totalTransactions: number
  avgDailyRevenue: number
  avgOrderValue: number
} {
  if (trends.length === 0) {
    return { totalRevenue: 0, totalTransactions: 0, avgDailyRevenue: 0, avgOrderValue: 0 }
  }
  const totalRevenue = trends.reduce((s, t) => s + t.revenue, 0)
  const totalTransactions = trends.reduce((s, t) => s + t.transactions, 0)
  const avgDailyRevenue = totalRevenue / trends.length
  const avgOrderValue = totalTransactions > 0 ? totalRevenue / totalTransactions : 0
  return { totalRevenue, totalTransactions, avgDailyRevenue, avgOrderValue }
}

function detectTrendDirection(values: number[]): TrendDirection {
  if (values.length < 2) return 'flat'
  const n = values.length
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0
  values.forEach((v, i) => {
    sumX += i; sumY += v; sumXY += i * v; sumX2 += i * i
  })
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
  if (slope > 100) return 'up'
  if (slope < -100) return 'down'
  return 'flat'
}

function rankTopN<T extends { revenue: number }>(items: T[], n: number): T[] {
  return [...items].sort((a, b) => b.revenue - a.revenue).slice(0, n)
}

function sortAlertsBySeverity(alerts: Alert[]): Alert[] {
  const order: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 }
  return [...alerts].sort((a, b) => order[a.severity] - order[b.severity])
}

function fillMissingDays(trends: DailyTrend[], days: number, startDate: string): DailyTrend[] {
  const byDate = new Map(trends.map(t => [t.date, t]))
  const start = new Date(startDate)
  const result: DailyTrend[] = []
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000)
    const dateStr = d.toISOString().slice(0, 10)
    result.push(byDate.get(dateStr) ?? { date: dateStr, revenue: 0, transactions: 0, avgOrderValue: 0 })
  }
  return result
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeTrend(overrides: Partial<DailyTrend> = {}): DailyTrend {
  return {
    date: '2026-07-01',
    revenue: 1_000_000,
    transactions: 10,
    avgOrderValue: 100_000,
    ...overrides,
  }
}

function makeAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: 'alert-1',
    type: 'low_stock',
    severity: 'warning',
    title: 'Stok Rendah',
    message: 'Produk A: 2 tersisa',
    createdAt: '2026-07-28T10:00:00Z',
    ...overrides,
  }
}

function makeRankingItem(overrides: Partial<RankingItem> = {}): RankingItem {
  return {
    id: 'item-1',
    name: 'Produk A',
    revenue: 5_000_000,
    unitsSold: 50,
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Revenue growth calculation', () => {
  it('calculates positive growth correctly', () => {
    const growth = calculateRevenueGrowth(12_000_000, 10_000_000)
    expect(growth).toBeCloseTo(20)
  })

  it('calculates negative growth correctly', () => {
    const growth = calculateRevenueGrowth(8_000_000, 10_000_000)
    expect(growth).toBeCloseTo(-20)
  })

  it('returns 0 when previous period is zero', () => {
    const growth = calculateRevenueGrowth(5_000_000, 0)
    expect(growth).toBe(0)
  })
})

describe('Profit margin calculation', () => {
  it('calculates margin correctly', () => {
    const margin = calculateProfitMargin(10_000_000, 6_000_000)
    expect(margin).toBeCloseTo(40)
  })

  it('returns 0 when revenue is zero', () => {
    const margin = calculateProfitMargin(0, 0)
    expect(margin).toBe(0)
  })

  it('returns 100% margin when cogs is zero', () => {
    const margin = calculateProfitMargin(10_000_000, 0)
    expect(margin).toBeCloseTo(100)
  })
})

describe('Alert severity classification', () => {
  it('classifies out-of-stock as critical', () => {
    expect(classifyAlertSeverity('low_stock', { currentStock: 0 })).toBe('critical')
  })

  it('classifies low stock (non-zero) as warning', () => {
    expect(classifyAlertSeverity('low_stock', { currentStock: 2 })).toBe('warning')
  })

  it('classifies overdue > 30 days as critical', () => {
    expect(classifyAlertSeverity('overdue_invoice', { daysOverdue: 45 })).toBe('critical')
  })

  it('classifies overdue <= 30 days as warning', () => {
    expect(classifyAlertSeverity('overdue_invoice', { daysOverdue: 15 })).toBe('warning')
  })

  it('classifies pending_approval as info', () => {
    expect(classifyAlertSeverity('pending_approval', {})).toBe('info')
  })

  it('classifies contract expiring within 7 days as critical', () => {
    expect(classifyAlertSeverity('expiring_contract', { daysLeft: 5 })).toBe('critical')
  })

  it('classifies contract expiring after 7 days as warning', () => {
    expect(classifyAlertSeverity('expiring_contract', { daysLeft: 20 })).toBe('warning')
  })
})

describe('Trend period aggregation', () => {
  const trends = [
    makeTrend({ date: '2026-07-01', revenue: 1_000_000, transactions: 10 }),
    makeTrend({ date: '2026-07-02', revenue: 1_500_000, transactions: 15 }),
    makeTrend({ date: '2026-07-03', revenue: 2_000_000, transactions: 20 }),
  ]

  it('sums total revenue correctly', () => {
    const { totalRevenue } = aggregateTrendPeriod(trends)
    expect(totalRevenue).toBe(4_500_000)
  })

  it('sums total transactions correctly', () => {
    const { totalTransactions } = aggregateTrendPeriod(trends)
    expect(totalTransactions).toBe(45)
  })

  it('calculates average daily revenue', () => {
    const { avgDailyRevenue } = aggregateTrendPeriod(trends)
    expect(avgDailyRevenue).toBeCloseTo(1_500_000)
  })

  it('returns zeros for empty trend list', () => {
    const result = aggregateTrendPeriod([])
    expect(result.totalRevenue).toBe(0)
    expect(result.totalTransactions).toBe(0)
    expect(result.avgDailyRevenue).toBe(0)
  })

  it('detects upward trend direction from increasing values', () => {
    const values = [100_000, 200_000, 300_000, 400_000, 500_000, 600_000, 700_000]
    expect(detectTrendDirection(values)).toBe('up')
  })

  it('detects downward trend direction from decreasing values', () => {
    const values = [700_000, 600_000, 500_000, 400_000, 300_000, 200_000, 100_000]
    expect(detectTrendDirection(values)).toBe('down')
  })

  it('fills missing days with zero entries', () => {
    const sparse: DailyTrend[] = [
      makeTrend({ date: '2026-07-01', revenue: 500_000, transactions: 5 }),
    ]
    const filled = fillMissingDays(sparse, 3, '2026-07-01')
    expect(filled).toHaveLength(3)
    expect(filled[1].revenue).toBe(0)
    expect(filled[1].date).toBe('2026-07-02')
  })
})

describe('Top N ranking', () => {
  const items: RankingItem[] = [
    makeRankingItem({ id: '1', name: 'A', revenue: 1_000_000 }),
    makeRankingItem({ id: '2', name: 'B', revenue: 5_000_000 }),
    makeRankingItem({ id: '3', name: 'C', revenue: 3_000_000 }),
    makeRankingItem({ id: '4', name: 'D', revenue: 4_000_000 }),
    makeRankingItem({ id: '5', name: 'E', revenue: 2_000_000 }),
    makeRankingItem({ id: '6', name: 'F', revenue: 6_000_000 }),
  ]

  it('returns exactly N items', () => {
    expect(rankTopN(items, 5)).toHaveLength(5)
  })

  it('returns items sorted by revenue descending', () => {
    const ranked = rankTopN(items, 3)
    expect(ranked[0].name).toBe('F')
    expect(ranked[1].name).toBe('B')
    expect(ranked[2].name).toBe('D')
  })

  it('handles fewer items than N gracefully', () => {
    const small = items.slice(0, 2)
    expect(rankTopN(small, 5)).toHaveLength(2)
  })

  it('sorts alerts: critical before warning before info', () => {
    const alerts = [
      makeAlert({ id: 'a1', severity: 'info' }),
      makeAlert({ id: 'a2', severity: 'critical' }),
      makeAlert({ id: 'a3', severity: 'warning' }),
    ]
    const sorted = sortAlertsBySeverity(alerts)
    expect(sorted[0].severity).toBe('critical')
    expect(sorted[1].severity).toBe('warning')
    expect(sorted[2].severity).toBe('info')
  })
})
