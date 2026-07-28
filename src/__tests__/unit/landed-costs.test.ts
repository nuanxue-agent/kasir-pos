import { describe, it, expect } from 'vitest'

// ─── Types ────────────────────────────────────────────────────────────────────

type AllocationMethod = 'BY_VALUE' | 'BY_QTY' | 'BY_WEIGHT'

interface LandedCostItem {
  productId: string
  poItemId: string
  lineValue: number
  qty: number
  weight: number
  unitCost: number
}

// ─── Pure functions (mirror of LandedCostClient exports) ──────────────────────

function allocateByValue(totalCost: number, items: LandedCostItem[]): Record<string, number> {
  const totalValue = items.reduce((s, i) => s + i.lineValue, 0)
  if (totalValue === 0) return Object.fromEntries(items.map(i => [i.productId, 0]))
  return Object.fromEntries(
    items.map(i => [i.productId, Math.round((i.lineValue / totalValue) * totalCost)]),
  )
}

function allocateByQty(totalCost: number, items: LandedCostItem[]): Record<string, number> {
  const totalQty = items.reduce((s, i) => s + i.qty, 0)
  if (totalQty === 0) return Object.fromEntries(items.map(i => [i.productId, 0]))
  return Object.fromEntries(
    items.map(i => [i.productId, Math.round((i.qty / totalQty) * totalCost)]),
  )
}

function allocateByWeight(totalCost: number, items: LandedCostItem[]): Record<string, number> {
  const totalWeight = items.reduce((s, i) => s + i.weight, 0)
  if (totalWeight === 0) return Object.fromEntries(items.map(i => [i.productId, 0]))
  return Object.fromEntries(
    items.map(i => [i.productId, Math.round((i.weight / totalWeight) * totalCost)]),
  )
}

function calcNewUnitCost(existingUnitCost: number, qty: number, allocatedAmount: number): number {
  if (qty <= 0) return existingUnitCost
  return Math.round((existingUnitCost * qty + allocatedAmount) / qty)
}

function calcTotalLandedCost(costs: { amount: number }[]): number {
  return costs.reduce((s, c) => s + c.amount, 0)
}

function allocate(
  method: AllocationMethod,
  totalCost: number,
  items: LandedCostItem[],
): Record<string, number> {
  if (method === 'BY_VALUE') return allocateByValue(totalCost, items)
  if (method === 'BY_QTY') return allocateByQty(totalCost, items)
  return allocateByWeight(totalCost, items)
}

// ─── Test data helpers ────────────────────────────────────────────────────────

function makeItem(overrides: Partial<LandedCostItem> = {}): LandedCostItem {
  return {
    productId: 'prod-1',
    poItemId: 'poi-1',
    lineValue: 100000,
    qty: 10,
    weight: 500,
    unitCost: 20000,
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Landed costs — by-value allocation', () => {
  it('allocates proportionally by line value', () => {
    const items = [
      makeItem({ productId: 'p1', lineValue: 300000 }),
      makeItem({ productId: 'p2', lineValue: 100000, poItemId: 'poi-2' }),
      makeItem({ productId: 'p3', lineValue: 100000, poItemId: 'poi-3' }),
    ]
    const result = allocateByValue(50000, items)
    expect(result['p1']).toBe(30000)
    expect(result['p2']).toBe(10000)
    expect(result['p3']).toBe(10000)
  })

  it('returns all zeros when total line value is 0', () => {
    const items = [
      makeItem({ productId: 'p1', lineValue: 0 }),
      makeItem({ productId: 'p2', lineValue: 0, poItemId: 'poi-2' }),
    ]
    const result = allocateByValue(50000, items)
    expect(result['p1']).toBe(0)
    expect(result['p2']).toBe(0)
  })

  it('handles single item — full cost allocated to it', () => {
    const items = [makeItem({ productId: 'p1', lineValue: 200000 })]
    const result = allocateByValue(30000, items)
    expect(result['p1']).toBe(30000)
  })
})

describe('Landed costs — by-quantity allocation', () => {
  it('allocates proportionally by qty', () => {
    const items = [
      makeItem({ productId: 'p1', qty: 4 }),
      makeItem({ productId: 'p2', qty: 6, poItemId: 'poi-2' }),
    ]
    const result = allocateByQty(100000, items)
    expect(result['p1']).toBe(40000)
    expect(result['p2']).toBe(60000)
  })

  it('returns all zeros when total qty is 0', () => {
    const items = [makeItem({ productId: 'p1', qty: 0 })]
    const result = allocateByQty(50000, items)
    expect(result['p1']).toBe(0)
  })

  it('uses allocate() dispatch for BY_QTY method', () => {
    const items = [
      makeItem({ productId: 'p1', qty: 3 }),
      makeItem({ productId: 'p2', qty: 7, poItemId: 'poi-2' }),
    ]
    const result = allocate('BY_QTY', 100000, items)
    expect(result['p1']).toBe(30000)
    expect(result['p2']).toBe(70000)
  })
})

describe('Landed costs — by-weight allocation', () => {
  it('allocates proportionally by weight', () => {
    const items = [
      makeItem({ productId: 'p1', weight: 1000 }),
      makeItem({ productId: 'p2', weight: 500, poItemId: 'poi-2' }),
      makeItem({ productId: 'p3', weight: 500, poItemId: 'poi-3' }),
    ]
    const result = allocateByWeight(80000, items)
    expect(result['p1']).toBe(40000)
    expect(result['p2']).toBe(20000)
    expect(result['p3']).toBe(20000)
  })

  it('returns all zeros when total weight is 0', () => {
    const items = [makeItem({ productId: 'p1', weight: 0 })]
    const result = allocateByWeight(50000, items)
    expect(result['p1']).toBe(0)
  })

  it('uses allocate() dispatch for BY_WEIGHT method', () => {
    const items = [
      makeItem({ productId: 'p1', weight: 2000 }),
      makeItem({ productId: 'p2', weight: 2000, poItemId: 'poi-2' }),
    ]
    const result = allocate('BY_WEIGHT', 60000, items)
    expect(result['p1']).toBe(30000)
    expect(result['p2']).toBe(30000)
  })
})

describe('Landed costs — new unit cost calculation', () => {
  it('adds allocated cost per unit to existing unit cost', () => {
    // existing 20000/unit, 10 units, +5000 allocated → new = (20000*10 + 5000) / 10 = 20500
    expect(calcNewUnitCost(20000, 10, 5000)).toBe(20500)
  })

  it('rounds to nearest integer', () => {
    // (10000*3 + 1000) / 3 = 10333.33 → 10333
    expect(calcNewUnitCost(10000, 3, 1000)).toBe(10333)
  })

  it('returns existing cost unchanged when qty is 0', () => {
    expect(calcNewUnitCost(15000, 0, 3000)).toBe(15000)
  })
})

describe('Landed costs — total landed cost', () => {
  it('sums all cost amounts', () => {
    const costs = [
      { amount: 500000 },  // freight
      { amount: 200000 },  // duty
      { amount: 50000 },   // insurance
    ]
    expect(calcTotalLandedCost(costs)).toBe(750000)
  })

  it('returns 0 for empty cost list', () => {
    expect(calcTotalLandedCost([])).toBe(0)
  })
})
