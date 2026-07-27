import { describe, it, expect } from 'vitest'

// ── Staff Performance & Commission business logic ─────────────────────────────

interface StaffOrder {
  userId: string
  total: number
  itemCount: number
  createdAt: string
}

interface StaffMetric {
  userId: string
  name: string
  totalOrders: number
  totalRevenue: number
  avgOrderValue: number
  itemsSold: number
  commissionRate: number
  commissionEarned: number
}

// ── Pure functions (mirrors API logic) ────────────────────────────────────────

function calcCommission(totalRevenue: number, commissionRate: number): number {
  if (commissionRate <= 0 || totalRevenue <= 0) return 0
  return (totalRevenue * commissionRate) / 100
}

function aggregateByStaff(
  orders: StaffOrder[],
  staffMap: Record<string, { name: string; commissionRate: number }>,
): StaffMetric[] {
  const acc: Record<string, { totalOrders: number; totalRevenue: number; itemsSold: number }> = {}

  for (const o of orders) {
    if (!acc[o.userId]) acc[o.userId] = { totalOrders: 0, totalRevenue: 0, itemsSold: 0 }
    acc[o.userId].totalOrders++
    acc[o.userId].totalRevenue += o.total
    acc[o.userId].itemsSold += o.itemCount
  }

  return Object.entries(acc).map(([userId, m]) => {
    const info = staffMap[userId] ?? { name: 'Unknown', commissionRate: 0 }
    const avgOrderValue = m.totalOrders > 0 ? m.totalRevenue / m.totalOrders : 0
    const commissionEarned = calcCommission(m.totalRevenue, info.commissionRate)
    return {
      userId,
      name: info.name,
      totalOrders: m.totalOrders,
      totalRevenue: m.totalRevenue,
      avgOrderValue,
      itemsSold: m.itemsSold,
      commissionRate: info.commissionRate,
      commissionEarned,
    }
  })
}

function filterByDateRange(orders: StaffOrder[], from: string, to: string): StaffOrder[] {
  const f = new Date(from).getTime()
  const t = new Date(to).getTime()
  return orders.filter(o => {
    const ts = new Date(o.createdAt).getTime()
    return ts >= f && ts <= t
  })
}

function rankByRevenue(metrics: StaffMetric[]): StaffMetric[] {
  return [...metrics].sort((a, b) => b.totalRevenue - a.totalRevenue)
}

function calcMonthlyCommissionSummary(metrics: StaffMetric[]): number {
  return metrics.reduce((sum, m) => sum + m.commissionEarned, 0)
}

// ── Test data ──────────────────────────────────────────────────────────────────

const STAFF_MAP: Record<string, { name: string; commissionRate: number }> = {
  u1: { name: 'Budi', commissionRate: 2 },
  u2: { name: 'Sari', commissionRate: 3 },
  u3: { name: 'Rizky', commissionRate: 0 },
}

const ORDERS: StaffOrder[] = [
  { userId: 'u1', total: 100_000, itemCount: 3, createdAt: '2025-06-10T10:00:00Z' },
  { userId: 'u1', total: 200_000, itemCount: 5, createdAt: '2025-06-11T09:00:00Z' },
  { userId: 'u2', total: 150_000, itemCount: 2, createdAt: '2025-06-10T11:00:00Z' },
  { userId: 'u2', total: 250_000, itemCount: 4, createdAt: '2025-06-12T14:00:00Z' },
  { userId: 'u3', total: 80_000, itemCount: 1, createdAt: '2025-06-10T08:00:00Z' },
  { userId: 'u1', total: 120_000, itemCount: 2, createdAt: '2025-07-01T10:00:00Z' },
]

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Commission calculation', () => {
  it('calculates commission correctly at 2%', () => {
    expect(calcCommission(300_000, 2)).toBe(6_000)
  })

  it('calculates commission correctly at 3%', () => {
    expect(calcCommission(400_000, 3)).toBe(12_000)
  })

  it('returns 0 commission when rate is 0', () => {
    expect(calcCommission(80_000, 0)).toBe(0)
  })

  it('returns 0 commission when revenue is 0', () => {
    expect(calcCommission(0, 5)).toBe(0)
  })
})

describe('Revenue per staff aggregation', () => {
  const juneOrders = ORDERS.filter(o => o.createdAt.startsWith('2025-06'))
  const metrics = aggregateByStaff(juneOrders, STAFF_MAP)

  it('aggregates total revenue correctly for Budi', () => {
    const budi = metrics.find(m => m.userId === 'u1')!
    expect(budi.totalRevenue).toBe(300_000)
  })

  it('aggregates total revenue correctly for Sari', () => {
    const sari = metrics.find(m => m.userId === 'u2')!
    expect(sari.totalRevenue).toBe(400_000)
  })

  it('counts orders correctly', () => {
    const budi = metrics.find(m => m.userId === 'u1')!
    expect(budi.totalOrders).toBe(2)
  })

  it('sums items sold correctly', () => {
    const budi = metrics.find(m => m.userId === 'u1')!
    expect(budi.itemsSold).toBe(8)
  })

  it('includes commission earned in aggregation', () => {
    const sari = metrics.find(m => m.userId === 'u2')!
    expect(sari.commissionEarned).toBe(12_000)
  })
})

describe('Avg order value calculation', () => {
  it('calculates average order value correctly', () => {
    const juneOrders = ORDERS.filter(o => o.createdAt.startsWith('2025-06'))
    const metrics = aggregateByStaff(juneOrders, STAFF_MAP)
    const budi = metrics.find(m => m.userId === 'u1')!
    expect(budi.avgOrderValue).toBe(150_000)
  })

  it('returns 0 avg order value when no orders', () => {
    const metrics = aggregateByStaff([], STAFF_MAP)
    expect(metrics.length).toBe(0)
  })
})

describe('Date range filtering', () => {
  it('filters orders within a date range', () => {
    // June 10: 3 orders (u1, u2, u3) + June 11: 1 order (u1) = 4
    const filtered = filterByDateRange(ORDERS, '2025-06-10T00:00:00Z', '2025-06-11T23:59:59Z')
    expect(filtered.length).toBe(4)
  })

  it('excludes orders outside the range', () => {
    const filtered = filterByDateRange(ORDERS, '2025-07-01T00:00:00Z', '2025-07-31T23:59:59Z')
    expect(filtered.every(o => o.userId === 'u1')).toBe(true)
    expect(filtered.length).toBe(1)
  })

  it('returns empty array when no orders match range', () => {
    const filtered = filterByDateRange(ORDERS, '2025-01-01T00:00:00Z', '2025-01-31T23:59:59Z')
    expect(filtered).toHaveLength(0)
  })
})

describe('Ranking logic', () => {
  it('ranks staff by revenue descending', () => {
    const juneOrders = ORDERS.filter(o => o.createdAt.startsWith('2025-06'))
    const metrics = aggregateByStaff(juneOrders, STAFF_MAP)
    const ranked = rankByRevenue(metrics)
    expect(ranked[0].totalRevenue).toBeGreaterThanOrEqual(ranked[1].totalRevenue)
    expect(ranked[1].totalRevenue).toBeGreaterThanOrEqual(ranked[2].totalRevenue)
  })

  it('puts highest earner first', () => {
    const juneOrders = ORDERS.filter(o => o.createdAt.startsWith('2025-06'))
    const metrics = aggregateByStaff(juneOrders, STAFF_MAP)
    const ranked = rankByRevenue(metrics)
    expect(ranked[0].name).toBe('Sari')
  })

  it('calculates total monthly commission summary', () => {
    const juneOrders = ORDERS.filter(o => o.createdAt.startsWith('2025-06'))
    const metrics = aggregateByStaff(juneOrders, STAFF_MAP)
    const total = calcMonthlyCommissionSummary(metrics)
    // Budi: 300000*2%=6000, Sari: 400000*3%=12000, Rizky: 0
    expect(total).toBe(18_000)
  })
})
