import { describe, it, expect } from 'vitest'

// ── Types (mirrors WasteTrackingClient) ────────────────────────────────────

type WasteReason = 'EXPIRED' | 'SPOILED' | 'DAMAGED' | 'OVERPRODUCTION' | 'OTHER'
type WasteShift = 'MORNING' | 'AFTERNOON' | 'EVENING'

interface WasteEntry {
  id: string
  storeId: string
  productId: string
  productName: string
  qty: number
  unit: string
  reason: WasteReason
  cost: number
  recordedBy: string
  recordedAt: string
  shift: WasteShift
  notes: string | null
}

// ── Pure helpers (same logic as component / API report) ────────────────────

function calcTotalCost(entries: WasteEntry[]): number {
  return entries.reduce((sum, e) => sum + e.cost, 0)
}

function calcTotalQty(entries: WasteEntry[]): number {
  return entries.reduce((sum, e) => sum + e.qty, 0)
}

function aggregateByShift(entries: WasteEntry[]): Record<WasteShift, { qty: number; cost: number }> {
  const result: Record<WasteShift, { qty: number; cost: number }> = {
    MORNING: { qty: 0, cost: 0 },
    AFTERNOON: { qty: 0, cost: 0 },
    EVENING: { qty: 0, cost: 0 },
  }
  for (const e of entries) {
    result[e.shift].qty += e.qty
    result[e.shift].cost += e.cost
  }
  return result
}

function aggregateByReason(entries: WasteEntry[]): Record<WasteReason, { qty: number; cost: number }> {
  const result: Record<WasteReason, { qty: number; cost: number }> = {
    EXPIRED: { qty: 0, cost: 0 },
    SPOILED: { qty: 0, cost: 0 },
    DAMAGED: { qty: 0, cost: 0 },
    OVERPRODUCTION: { qty: 0, cost: 0 },
    OTHER: { qty: 0, cost: 0 },
  }
  for (const e of entries) {
    result[e.reason].qty += e.qty
    result[e.reason].cost += e.cost
  }
  return result
}

function calcDailyTotal(entries: WasteEntry[], date: string): { qty: number; cost: number } {
  const day = entries.filter(e => e.recordedAt.startsWith(date))
  return {
    qty: day.reduce((s, e) => s + e.qty, 0),
    cost: day.reduce((s, e) => s + e.cost, 0),
  }
}

function calcWasteRate(wastedQty: number, totalInventoryQty: number): number {
  if (totalInventoryQty <= 0) return 0
  return (wastedQty / totalInventoryQty) * 100
}

function topProductsByLoss(
  entries: WasteEntry[],
  limit = 5
): Array<{ productId: string; productName: string; cost: number; qty: number }> {
  const map: Record<string, { productName: string; cost: number; qty: number }> = {}
  for (const e of entries) {
    if (!map[e.productId]) map[e.productId] = { productName: e.productName, cost: 0, qty: 0 }
    map[e.productId].cost += e.cost
    map[e.productId].qty += e.qty
  }
  return Object.entries(map)
    .map(([productId, d]) => ({ productId, ...d }))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, limit)
}

// ── Fixtures ───────────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<WasteEntry> = {}): WasteEntry {
  return {
    id: 'e1',
    storeId: 's1',
    productId: 'p1',
    productName: 'Roti Tawar',
    qty: 2,
    unit: 'pcs',
    reason: 'EXPIRED',
    cost: 10_000,
    recordedBy: 'ali',
    recordedAt: '2026-07-15T08:00:00Z',
    shift: 'MORNING',
    notes: null,
    ...overrides,
  }
}

const SAMPLE: WasteEntry[] = [
  makeEntry({ id: 'e1', qty: 3, cost: 15_000, reason: 'EXPIRED', shift: 'MORNING', recordedAt: '2026-07-15T08:00:00Z' }),
  makeEntry({ id: 'e2', qty: 1, cost: 5_000, reason: 'SPOILED', shift: 'AFTERNOON', recordedAt: '2026-07-15T13:00:00Z' }),
  makeEntry({ id: 'e3', qty: 2, cost: 8_000, reason: 'DAMAGED', shift: 'EVENING', recordedAt: '2026-07-16T19:00:00Z' }),
  makeEntry({ id: 'e4', qty: 5, cost: 20_000, reason: 'OVERPRODUCTION', shift: 'MORNING', recordedAt: '2026-07-16T09:00:00Z', productId: 'p2', productName: 'Croissant' }),
  makeEntry({ id: 'e5', qty: 1, cost: 3_000, reason: 'OTHER', shift: 'MORNING', recordedAt: '2026-07-17T07:30:00Z' }),
]

// ── Tests ──────────────────────────────────────────────────────────────────

describe('Waste cost calculation', () => {
  it('sums cost across all entries', () => {
    expect(calcTotalCost(SAMPLE)).toBe(51_000)
  })

  it('returns 0 for empty list', () => {
    expect(calcTotalCost([])).toBe(0)
  })

  it('calculates cost for single entry', () => {
    expect(calcTotalCost([makeEntry({ cost: 7_500 })])).toBe(7_500)
  })
})

describe('Shift aggregation', () => {
  it('aggregates qty and cost per shift', () => {
    const result = aggregateByShift(SAMPLE)
    expect(result.MORNING.qty).toBe(9)   // e1(3) + e4(5) + e5(1)
    expect(result.AFTERNOON.qty).toBe(1) // e2
    expect(result.EVENING.qty).toBe(2)   // e3
  })

  it('aggregates cost per shift correctly', () => {
    const result = aggregateByShift(SAMPLE)
    expect(result.MORNING.cost).toBe(38_000)  // 15k + 20k + 3k
    expect(result.AFTERNOON.cost).toBe(5_000)
    expect(result.EVENING.cost).toBe(8_000)
  })

  it('all shifts start at 0 for empty list', () => {
    const result = aggregateByShift([])
    expect(result.MORNING).toEqual({ qty: 0, cost: 0 })
    expect(result.AFTERNOON).toEqual({ qty: 0, cost: 0 })
    expect(result.EVENING).toEqual({ qty: 0, cost: 0 })
  })
})

describe('Reason breakdown', () => {
  it('breaks down qty and cost by reason', () => {
    const result = aggregateByReason(SAMPLE)
    expect(result.EXPIRED.qty).toBe(3)
    expect(result.EXPIRED.cost).toBe(15_000)
    expect(result.OVERPRODUCTION.qty).toBe(5)
    expect(result.OVERPRODUCTION.cost).toBe(20_000)
  })

  it('unused reasons remain at zero', () => {
    const entries = [makeEntry({ reason: 'DAMAGED', qty: 2, cost: 6_000 })]
    const result = aggregateByReason(entries)
    expect(result.EXPIRED).toEqual({ qty: 0, cost: 0 })
    expect(result.SPOILED).toEqual({ qty: 0, cost: 0 })
    expect(result.DAMAGED).toEqual({ qty: 2, cost: 6_000 })
  })
})

describe('Daily waste total', () => {
  it('sums entries for a given day', () => {
    const day = calcDailyTotal(SAMPLE, '2026-07-15')
    expect(day.qty).toBe(4)   // e1(3) + e2(1)
    expect(day.cost).toBe(20_000)
  })

  it('returns zero for a day with no entries', () => {
    const day = calcDailyTotal(SAMPLE, '2026-08-01')
    expect(day.qty).toBe(0)
    expect(day.cost).toBe(0)
  })

  it('handles single-entry day', () => {
    const day = calcDailyTotal(SAMPLE, '2026-07-17')
    expect(day.qty).toBe(1)
    expect(day.cost).toBe(3_000)
  })
})

describe('Waste rate percentage', () => {
  it('calculates correct percentage', () => {
    expect(calcWasteRate(10, 100)).toBeCloseTo(10)
  })

  it('returns 0 when total inventory is zero', () => {
    expect(calcWasteRate(5, 0)).toBe(0)
  })

  it('returns 100 when all inventory is wasted', () => {
    expect(calcWasteRate(50, 50)).toBeCloseTo(100)
  })
})

describe('Top products by loss', () => {
  it('ranks products by cost descending', () => {
    const top = topProductsByLoss(SAMPLE)
    // p1 (Roti Tawar): 15k+5k+8k+3k = 31k, p2 (Croissant): 20k
    expect(top[0].productId).toBe('p1')
    expect(top[1].productId).toBe('p2')
  })

  it('aggregates multiple entries for same product', () => {
    const top = topProductsByLoss(SAMPLE)
    const roti = top.find(t => t.productId === 'p1')
    // p1 entries: e1(15k) + e2(5k) + e3(8k) + e5(3k) = 31k
    expect(roti?.cost).toBe(31_000)
  })
})
