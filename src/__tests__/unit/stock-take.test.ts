import { describe, it, expect } from 'vitest'

// ── Types ─────────────────────────────────────────────────────────────────────

type StockTakeStatus = 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED'

interface StockTakeItem {
  id: string
  stockTakeId: string
  productId: string
  expectedQty: number
  countedQty: number | null
  variance: number
  notes: string | null
}

interface StockTake {
  id: string
  storeId: string
  status: StockTakeStatus
  startedAt: string
  completedAt: string | null
  notes: string | null
}

// ── Pure functions mirroring API logic ────────────────────────────────────────

function calcVariance(expectedQty: number, countedQty: number): number {
  return countedQty - expectedQty
}

function calcAdjustmentQty(variance: number): number {
  return Math.abs(variance)
}

function adjustmentDirection(variance: number): 'surplus' | 'shortage' | 'none' {
  if (variance > 0) return 'surplus'
  if (variance < 0) return 'shortage'
  return 'none'
}

function canFinalize(take: StockTake): { ok: boolean; error?: string } {
  if (take.status === 'COMPLETED') {
    return { ok: false, error: 'Stock take already completed' }
  }
  return { ok: true }
}

function validateFinalizeItems(items: StockTakeItem[]): { ok: boolean; uncounted: number } {
  const uncounted = items.filter(i => i.countedQty === null).length
  return { ok: uncounted === 0, uncounted }
}

function transitionStatus(
  current: StockTakeStatus,
  action: 'start_counting' | 'finalize',
): StockTakeStatus | null {
  if (action === 'start_counting') {
    if (current === 'DRAFT') return 'IN_PROGRESS'
    return null // no transition
  }
  if (action === 'finalize') {
    if (current === 'IN_PROGRESS' || current === 'DRAFT') return 'COMPLETED'
    return null
  }
  return null
}

function aggregateItemVariances(items: StockTakeItem[]): {
  total: number
  surplus: number
  shortage: number
  unchanged: number
} {
  let total = 0
  let surplus = 0
  let shortage = 0
  let unchanged = 0
  for (const item of items) {
    const v = item.variance
    total += v
    if (v > 0) surplus++
    else if (v < 0) shortage++
    else unchanged++
  }
  return { total, surplus, shortage, unchanged }
}

function buildAdjustments(
  items: StockTakeItem[],
  takeId: string,
): Array<{ productId: string; qty: number; note: string }> {
  return items
    .filter(i => i.variance !== 0)
    .map(i => ({
      productId: i.productId,
      qty: Math.abs(i.variance),
      note: `Stock take #${takeId.slice(-8)} (${i.variance > 0 ? 'surplus' : 'shortage'})`,
    }))
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const baseTake: StockTake = {
  id: 'take-abc-00001',
  storeId: 'store-1',
  status: 'IN_PROGRESS',
  startedAt: '2026-07-01T00:00:00.000Z',
  completedAt: null,
  notes: null,
}

const baseItem = (overrides: Partial<StockTakeItem> = {}): StockTakeItem => ({
  id: 'item-1',
  stockTakeId: baseTake.id,
  productId: 'p-1',
  expectedQty: 20,
  countedQty: null,
  variance: 0,
  notes: null,
  ...overrides,
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Variance calculation', () => {
  it('zero variance when counted equals expected', () => {
    expect(calcVariance(20, 20)).toBe(0)
  })

  it('positive variance (surplus) when counted > expected', () => {
    expect(calcVariance(20, 25)).toBe(5)
  })

  it('negative variance (shortage) when counted < expected', () => {
    expect(calcVariance(20, 15)).toBe(-5)
  })

  it('handles zero expected qty (new product)', () => {
    expect(calcVariance(0, 10)).toBe(10)
  })
})

describe('Adjustment amount', () => {
  it('adjustment qty is absolute value of variance', () => {
    expect(calcAdjustmentQty(5)).toBe(5)
    expect(calcAdjustmentQty(-5)).toBe(5)
    expect(calcAdjustmentQty(0)).toBe(0)
  })

  it('identifies surplus direction', () => {
    expect(adjustmentDirection(3)).toBe('surplus')
  })

  it('identifies shortage direction', () => {
    expect(adjustmentDirection(-3)).toBe('shortage')
  })

  it('identifies no-change when variance is zero', () => {
    expect(adjustmentDirection(0)).toBe('none')
  })
})

describe('Finalize validation', () => {
  it('cannot finalize a COMPLETED stock take', () => {
    const take: StockTake = { ...baseTake, status: 'COMPLETED', completedAt: '2026-07-02T00:00:00.000Z' }
    const result = canFinalize(take)
    expect(result.ok).toBe(false)
    expect(result.error).toBe('Stock take already completed')
  })

  it('can finalize an IN_PROGRESS stock take', () => {
    expect(canFinalize({ ...baseTake, status: 'IN_PROGRESS' }).ok).toBe(true)
  })

  it('blocks finalize when some items have not been counted', () => {
    const items = [
      baseItem({ productId: 'p-1', countedQty: 10, variance: -10 }),
      baseItem({ id: 'item-2', productId: 'p-2', countedQty: null, variance: 0 }),
    ]
    const result = validateFinalizeItems(items)
    expect(result.ok).toBe(false)
    expect(result.uncounted).toBe(1)
  })

  it('passes finalize validation when all items are counted', () => {
    const items = [
      baseItem({ productId: 'p-1', countedQty: 20, variance: 0 }),
      baseItem({ id: 'item-2', productId: 'p-2', expectedQty: 5, countedQty: 7, variance: 2 }),
    ]
    const result = validateFinalizeItems(items)
    expect(result.ok).toBe(true)
    expect(result.uncounted).toBe(0)
  })
})

describe('Status transitions', () => {
  it('DRAFT → IN_PROGRESS on start_counting', () => {
    expect(transitionStatus('DRAFT', 'start_counting')).toBe('IN_PROGRESS')
  })

  it('IN_PROGRESS stays IN_PROGRESS on start_counting (no-op)', () => {
    expect(transitionStatus('IN_PROGRESS', 'start_counting')).toBeNull()
  })

  it('IN_PROGRESS → COMPLETED on finalize', () => {
    expect(transitionStatus('IN_PROGRESS', 'finalize')).toBe('COMPLETED')
  })

  it('COMPLETED cannot be transitioned further', () => {
    expect(transitionStatus('COMPLETED', 'finalize')).toBeNull()
  })
})

describe('Item count aggregation', () => {
  it('aggregates surplus/shortage/unchanged counts correctly', () => {
    const items = [
      baseItem({ productId: 'p-1', countedQty: 25, variance: 5 }),   // surplus
      baseItem({ id: 'i2', productId: 'p-2', countedQty: 15, variance: -5 }), // shortage
      baseItem({ id: 'i3', productId: 'p-3', countedQty: 20, variance: 0 }),  // unchanged
      baseItem({ id: 'i4', productId: 'p-4', countedQty: 22, variance: 2 }),   // surplus
    ]
    const result = aggregateItemVariances(items)
    expect(result.surplus).toBe(2)
    expect(result.shortage).toBe(1)
    expect(result.unchanged).toBe(1)
    expect(result.total).toBe(2) // 5 - 5 + 0 + 2
  })

  it('builds adjustment records only for items with non-zero variance', () => {
    const items = [
      baseItem({ productId: 'p-1', countedQty: 25, variance: 5 }),
      baseItem({ id: 'i2', productId: 'p-2', countedQty: 20, variance: 0 }),
      baseItem({ id: 'i3', productId: 'p-3', countedQty: 15, variance: -5 }),
    ]
    const adjs = buildAdjustments(items, 'take-abc-00001')
    expect(adjs).toHaveLength(2)
    expect(adjs[0].productId).toBe('p-1')
    expect(adjs[0].qty).toBe(5)
    expect(adjs[0].note).toContain('surplus')
    expect(adjs[1].productId).toBe('p-3')
    expect(adjs[1].qty).toBe(5)
    expect(adjs[1].note).toContain('shortage')
  })

  it('returns empty adjustments when all items match expected qty', () => {
    const items = [
      baseItem({ productId: 'p-1', countedQty: 20, variance: 0 }),
      baseItem({ id: 'i2', productId: 'p-2', expectedQty: 10, countedQty: 10, variance: 0 }),
    ]
    expect(buildAdjustments(items, 'take-abc-00001')).toHaveLength(0)
  })
})
