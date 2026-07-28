import { describe, it, expect } from 'vitest'

// ── Types ─────────────────────────────────────────────────────────────────────

type StocktakeStatus = 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED'

interface StocktakeItem {
  id: string
  stocktakeId: string
  productId: string
  systemQty: number
  countedQty: number | null
  variance: number
  notes: string | null
  cost?: number
}

// ── Pure logic functions (mirroring API/component logic) ──────────────────────

export function calcVariance(systemQty: number, countedQty: number): number {
  return countedQty - systemQty
}

export function calcVariancePct(systemQty: number, countedQty: number): number {
  if (systemQty === 0) return countedQty === 0 ? 0 : Infinity
  return ((countedQty - systemQty) / systemQty) * 100
}

export function calcTotalVarianceValue(items: StocktakeItem[]): number {
  return items.reduce((sum, item) => {
    if (item.countedQty === null) return sum
    const cost = item.cost ?? 0
    return sum + item.variance * cost
  }, 0)
}

export function calcAdjustmentQty(variance: number): number {
  return Math.abs(variance)
}

export function adjustmentDirection(variance: number): 'surplus' | 'shortage' | 'none' {
  if (variance > 0) return 'surplus'
  if (variance < 0) return 'shortage'
  return 'none'
}

type StatusAction = 'start' | 'complete'

const TRANSITIONS: Record<StocktakeStatus, StocktakeStatus[]> = {
  DRAFT:       ['IN_PROGRESS'],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED:   [],
}

export function transitionStatus(
  current: StocktakeStatus,
  next: StocktakeStatus,
): { ok: boolean; error?: string } {
  if (!TRANSITIONS[current].includes(next)) {
    return { ok: false, error: `Cannot transition from ${current} to ${next}` }
  }
  return { ok: true }
}

export function filterDiscrepancies(items: StocktakeItem[]): StocktakeItem[] {
  return items.filter(i => i.countedQty !== null && i.variance !== 0)
}

export function buildAdjustments(
  items: StocktakeItem[],
  stocktakeId: string,
): Array<{ productId: string; qty: number; direction: string; note: string }> {
  return items
    .filter(i => i.countedQty !== null && i.variance !== 0)
    .map(i => ({
      productId: i.productId,
      qty: Math.abs(i.variance),
      direction: adjustmentDirection(i.variance),
      note: `Stocktake #${stocktakeId.slice(-8)} (${adjustmentDirection(i.variance)})`,
    }))
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

const baseItem = (overrides: Partial<StocktakeItem> = {}): StocktakeItem => ({
  id: 'item-1',
  stocktakeId: 'take-001',
  productId: 'p-1',
  systemQty: 20,
  countedQty: null,
  variance: 0,
  notes: null,
  cost: 5000,
  ...overrides,
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Variance calculation', () => {
  it('returns 0 when counted equals system qty', () => {
    expect(calcVariance(20, 20)).toBe(0)
  })

  it('returns positive when counted > system (surplus)', () => {
    expect(calcVariance(20, 25)).toBe(5)
  })

  it('returns negative when counted < system (shortage)', () => {
    expect(calcVariance(20, 15)).toBe(-5)
  })
})

describe('Variance percentage', () => {
  it('calculates percentage correctly for surplus', () => {
    expect(calcVariancePct(20, 25)).toBeCloseTo(25)
  })

  it('calculates percentage correctly for shortage', () => {
    expect(calcVariancePct(20, 15)).toBeCloseTo(-25)
  })

  it('returns 0 when both system and counted are zero', () => {
    expect(calcVariancePct(0, 0)).toBe(0)
  })

  it('returns Infinity when system qty is 0 and counted > 0', () => {
    expect(calcVariancePct(0, 5)).toBe(Infinity)
  })
})

describe('Adjustment logic', () => {
  it('adjustment qty is absolute value of variance', () => {
    expect(calcAdjustmentQty(5)).toBe(5)
    expect(calcAdjustmentQty(-5)).toBe(5)
    expect(calcAdjustmentQty(0)).toBe(0)
  })

  it('builds adjustment records for items with variance', () => {
    const items = [
      baseItem({ productId: 'p-1', countedQty: 25, variance: 5 }),
      baseItem({ id: 'i2', productId: 'p-2', countedQty: 20, variance: 0 }),
      baseItem({ id: 'i3', productId: 'p-3', countedQty: 15, variance: -5 }),
    ]
    const adjs = buildAdjustments(items, 'take-abc-00001')
    expect(adjs).toHaveLength(2)
    expect(adjs[0].direction).toBe('surplus')
    expect(adjs[1].direction).toBe('shortage')
  })

  it('returns empty adjustments when no variance exists', () => {
    const items = [
      baseItem({ productId: 'p-1', countedQty: 20, variance: 0 }),
      baseItem({ id: 'i2', productId: 'p-2', systemQty: 10, countedQty: 10, variance: 0 }),
    ]
    expect(buildAdjustments(items, 'take-001')).toHaveLength(0)
  })
})

describe('Status transitions', () => {
  it('DRAFT → IN_PROGRESS is allowed', () => {
    expect(transitionStatus('DRAFT', 'IN_PROGRESS').ok).toBe(true)
  })

  it('IN_PROGRESS → COMPLETED is allowed', () => {
    expect(transitionStatus('IN_PROGRESS', 'COMPLETED').ok).toBe(true)
  })

  it('DRAFT → COMPLETED is not allowed', () => {
    const result = transitionStatus('DRAFT', 'COMPLETED')
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/Cannot transition/)
  })

  it('COMPLETED → any state is not allowed', () => {
    expect(transitionStatus('COMPLETED', 'IN_PROGRESS').ok).toBe(false)
    expect(transitionStatus('COMPLETED', 'DRAFT').ok).toBe(false)
  })
})

describe('Total variance value', () => {
  it('calculates total monetary value of variances', () => {
    const items = [
      baseItem({ productId: 'p-1', countedQty: 25, variance: 5, cost: 10000 }),
      baseItem({ id: 'i2', productId: 'p-2', systemQty: 10, countedQty: 8, variance: -2, cost: 5000 }),
    ]
    // (5 * 10000) + (-2 * 5000) = 50000 - 10000 = 40000
    expect(calcTotalVarianceValue(items)).toBe(40000)
  })

  it('excludes uncounted items from total value', () => {
    const items = [
      baseItem({ productId: 'p-1', countedQty: 25, variance: 5, cost: 10000 }),
      baseItem({ id: 'i2', productId: 'p-2', countedQty: null, variance: 0, cost: 5000 }),
    ]
    expect(calcTotalVarianceValue(items)).toBe(50000)
  })

  it('returns 0 when all variances are zero', () => {
    const items = [
      baseItem({ productId: 'p-1', countedQty: 20, variance: 0, cost: 10000 }),
    ]
    expect(calcTotalVarianceValue(items)).toBe(0)
  })
})
