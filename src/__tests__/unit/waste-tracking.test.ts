import { describe, it, expect } from 'vitest'
import { calcWasteSummary, calcMonthlyTrends } from '@/components/inventory/WasteTrackingClient'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const base = {
  storeId: 'store-1',
  productId: 'prod-1',
  productName: 'Roti Tawar - Bakery',
}

function makeLog(overrides: Partial<{
  id: string
  productId: string
  productName: string
  qty: number
  reason: 'EXPIRED' | 'DAMAGED' | 'SPOILED' | 'RETURNED' | 'OTHER'
  cost: number
  recordedBy: string
  recordedAt: string
  notes: string | null
}>) {
  return {
    id: 'log-1',
    storeId: 'store-1',
    productId: 'prod-1',
    productName: 'Roti Tawar - Bakery',
    qty: 1,
    reason: 'EXPIRED' as const,
    cost: 5000,
    recordedBy: 'Alice',
    recordedAt: '2024-03-15T10:00:00Z',
    notes: null,
    ...overrides,
  }
}

// ── Waste Cost Calculation ─────────────────────────────────────────────────────

describe('Waste cost calculation', () => {
  it('sums total cost across all logs', () => {
    const logs = [
      makeLog({ id: '1', cost: 5000 }),
      makeLog({ id: '2', cost: 3000 }),
      makeLog({ id: '3', cost: 2000 }),
    ]
    const summary = calcWasteSummary(logs)
    expect(summary.totalCost).toBe(10000)
  })

  it('sums total qty across all logs', () => {
    const logs = [
      makeLog({ id: '1', qty: 2, cost: 10000 }),
      makeLog({ id: '2', qty: 5, cost: 25000 }),
    ]
    const summary = calcWasteSummary(logs)
    expect(summary.totalQty).toBe(7)
  })

  it('returns zero totals for empty log list', () => {
    const summary = calcWasteSummary([])
    expect(summary.totalCost).toBe(0)
    expect(summary.totalQty).toBe(0)
  })
})

// ── Reason Breakdown Aggregation ──────────────────────────────────────────────

describe('Reason breakdown aggregation', () => {
  it('groups logs by reason and sums cost', () => {
    const logs = [
      makeLog({ id: '1', reason: 'EXPIRED', cost: 5000, qty: 1 }),
      makeLog({ id: '2', reason: 'EXPIRED', cost: 3000, qty: 2 }),
      makeLog({ id: '3', reason: 'DAMAGED', cost: 8000, qty: 3 }),
    ]
    const summary = calcWasteSummary(logs)
    expect(summary.byReason.EXPIRED.cost).toBe(8000)
    expect(summary.byReason.EXPIRED.qty).toBe(3)
    expect(summary.byReason.DAMAGED.cost).toBe(8000)
    expect(summary.byReason.DAMAGED.qty).toBe(3)
  })

  it('initializes all reason buckets to zero even with no matching logs', () => {
    const logs = [makeLog({ id: '1', reason: 'SPOILED', cost: 1000, qty: 1 })]
    const summary = calcWasteSummary(logs)
    expect(summary.byReason.EXPIRED.cost).toBe(0)
    expect(summary.byReason.DAMAGED.cost).toBe(0)
    expect(summary.byReason.RETURNED.cost).toBe(0)
    expect(summary.byReason.OTHER.cost).toBe(0)
    expect(summary.byReason.SPOILED.cost).toBe(1000)
  })

  it('handles all five reason types', () => {
    const reasons = ['EXPIRED', 'DAMAGED', 'SPOILED', 'RETURNED', 'OTHER'] as const
    const logs = reasons.map((reason, i) =>
      makeLog({ id: `log-${i}`, reason, cost: (i + 1) * 1000, qty: i + 1 })
    )
    const summary = calcWasteSummary(logs)
    expect(summary.byReason.EXPIRED.cost).toBe(1000)
    expect(summary.byReason.DAMAGED.cost).toBe(2000)
    expect(summary.byReason.SPOILED.cost).toBe(3000)
    expect(summary.byReason.RETURNED.cost).toBe(4000)
    expect(summary.byReason.OTHER.cost).toBe(5000)
  })
})

// ── Monthly Trend Aggregation ─────────────────────────────────────────────────

describe('Monthly trend aggregation', () => {
  it('groups logs by year-month', () => {
    const logs = [
      makeLog({ id: '1', recordedAt: '2024-01-10T10:00:00Z', cost: 5000, qty: 2 }),
      makeLog({ id: '2', recordedAt: '2024-01-25T10:00:00Z', cost: 3000, qty: 1 }),
      makeLog({ id: '3', recordedAt: '2024-02-05T10:00:00Z', cost: 7000, qty: 3 }),
    ]
    const trends = calcMonthlyTrends(logs)
    const jan = trends.find(t => t.month === '2024-01')
    const feb = trends.find(t => t.month === '2024-02')
    expect(jan?.cost).toBe(8000)
    expect(jan?.qty).toBe(3)
    expect(feb?.cost).toBe(7000)
    expect(feb?.qty).toBe(3)
  })

  it('returns results sorted ascending by month', () => {
    const logs = [
      makeLog({ id: '1', recordedAt: '2024-03-01T00:00:00Z', cost: 1000, qty: 1 }),
      makeLog({ id: '2', recordedAt: '2024-01-01T00:00:00Z', cost: 2000, qty: 1 }),
      makeLog({ id: '3', recordedAt: '2024-02-01T00:00:00Z', cost: 3000, qty: 1 }),
    ]
    const trends = calcMonthlyTrends(logs)
    expect(trends[0].month).toBe('2024-01')
    expect(trends[1].month).toBe('2024-02')
    expect(trends[2].month).toBe('2024-03')
  })

  it('returns empty array for empty log list', () => {
    expect(calcMonthlyTrends([])).toEqual([])
  })
})

// ── Employee Waste Tracking ────────────────────────────────────────────────────

describe('Employee waste tracking', () => {
  it('groups waste cost by employee', () => {
    const logs = [
      makeLog({ id: '1', recordedBy: 'Alice', cost: 5000, qty: 2 }),
      makeLog({ id: '2', recordedBy: 'Alice', cost: 3000, qty: 1 }),
      makeLog({ id: '3', recordedBy: 'Bob', cost: 8000, qty: 4 }),
    ]
    const summary = calcWasteSummary(logs)
    expect(summary.byEmployee['Alice'].cost).toBe(8000)
    expect(summary.byEmployee['Alice'].qty).toBe(3)
    expect(summary.byEmployee['Bob'].cost).toBe(8000)
    expect(summary.byEmployee['Bob'].qty).toBe(4)
  })

  it('tracks multiple employees independently', () => {
    const employees = ['Alice', 'Bob', 'Charlie']
    const logs = employees.map((emp, i) =>
      makeLog({ id: `log-${i}`, recordedBy: emp, cost: (i + 1) * 2000, qty: i + 1 })
    )
    const summary = calcWasteSummary(logs)
    expect(Object.keys(summary.byEmployee)).toHaveLength(3)
    expect(summary.byEmployee['Charlie'].cost).toBe(6000)
  })
})

// ── Category-level Waste ──────────────────────────────────────────────────────

describe('Category-level waste', () => {
  it('extracts category from productName using " - " separator', () => {
    const logs = [
      makeLog({ id: '1', productName: 'Roti Tawar - Bakery', cost: 5000, qty: 1 }),
      makeLog({ id: '2', productName: 'Croissant - Bakery', cost: 3000, qty: 2 }),
      makeLog({ id: '3', productName: 'Susu Full Cream - Dairy', cost: 7000, qty: 1 }),
    ]
    const summary = calcWasteSummary(logs)
    expect(summary.byCategory['Bakery'].cost).toBe(8000)
    expect(summary.byCategory['Bakery'].qty).toBe(3)
    expect(summary.byCategory['Dairy'].cost).toBe(7000)
  })

  it('falls back to "Uncategorized" when productName has no " - " separator', () => {
    const logs = [
      makeLog({ id: '1', productName: 'Generic Product', cost: 4000, qty: 2 }),
    ]
    const summary = calcWasteSummary(logs)
    expect(summary.byCategory['Uncategorized'].cost).toBe(4000)
  })
})
