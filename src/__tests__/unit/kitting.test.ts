import { describe, it, expect } from 'vitest'

// ── Types ─────────────────────────────────────────────────────────────────────

interface KitComponent {
  componentProductId: string
  requiredQty: number
}

// ── Pure business logic (mirrors KittingClient exports) ───────────────────────

function checkFeasibility(
  components: KitComponent[],
  stock: Record<string, number>,
  targetQty: number,
): { feasible: boolean; shortage: Array<{ productId: string; required: number; available: number }> } {
  const shortage: Array<{ productId: string; required: number; available: number }> = []
  for (const c of components) {
    const needed = c.requiredQty * targetQty
    const available = stock[c.componentProductId] ?? 0
    if (available < needed) {
      shortage.push({ productId: c.componentProductId, required: needed, available })
    }
  }
  return { feasible: shortage.length === 0, shortage }
}

function calcMaxAssemblable(
  components: KitComponent[],
  stock: Record<string, number>,
): number {
  if (components.length === 0) return 0
  return Math.floor(
    Math.min(...components.map(c => (stock[c.componentProductId] ?? 0) / c.requiredQty)),
  )
}

function calcKitCost(
  components: KitComponent[],
  costs: Record<string, number>,
  targetQty: number,
): number {
  return components.reduce(
    (sum, c) => sum + (costs[c.componentProductId] ?? 0) * c.requiredQty * targetQty,
    0,
  )
}

function calcPartialAssemblable(
  components: KitComponent[],
  stock: Record<string, number>,
  requestedQty: number,
): { possible: number; shortage: KitComponent[] } {
  const max = calcMaxAssemblable(components, stock)
  const possible = Math.min(max, requestedQty)
  const shortage = components.filter(c => (stock[c.componentProductId] ?? 0) < c.requiredQty * requestedQty)
  return { possible, shortage }
}

// ── Test fixtures ─────────────────────────────────────────────────────────────

const components: KitComponent[] = [
  { componentProductId: 'prod-a', requiredQty: 2 },
  { componentProductId: 'prod-b', requiredQty: 3 },
]

const stock: Record<string, number> = {
  'prod-a': 10,
  'prod-b': 12,
}

const costs: Record<string, number> = {
  'prod-a': 5000,
  'prod-b': 3000,
}

// ── Feasibility checks ────────────────────────────────────────────────────────

describe('Feasibility check', () => {
  it('is feasible when stock covers all components for target qty', () => {
    const result = checkFeasibility(components, stock, 3)
    expect(result.feasible).toBe(true)
    expect(result.shortage).toHaveLength(0)
  })

  it('is not feasible when one component is short', () => {
    // prod-b needs 3*5=15 but only 12 in stock
    const result = checkFeasibility(components, { ...stock, 'prod-b': 5 }, 3)
    expect(result.feasible).toBe(false)
    expect(result.shortage).toHaveLength(1)
    expect(result.shortage[0].productId).toBe('prod-b')
  })

  it('reports correct shortage quantities', () => {
    const result = checkFeasibility(components, { 'prod-a': 1, 'prod-b': 2 }, 2)
    const shortA = result.shortage.find(s => s.productId === 'prod-a')
    expect(shortA?.required).toBe(4) // 2 * 2
    expect(shortA?.available).toBe(1)
  })

  it('treats missing stock entry as zero', () => {
    const result = checkFeasibility(components, { 'prod-a': 10 }, 1)
    expect(result.feasible).toBe(false)
    expect(result.shortage[0].productId).toBe('prod-b')
  })
})

// ── Max assemblable ───────────────────────────────────────────────────────────

describe('Max assemblable calculation', () => {
  it('returns floor of min ratio across components', () => {
    // prod-a: 10/2=5, prod-b: 12/3=4 → min = 4
    expect(calcMaxAssemblable(components, stock)).toBe(4)
  })

  it('is limited by the most constrained component', () => {
    expect(calcMaxAssemblable(components, { 'prod-a': 100, 'prod-b': 6 })).toBe(2)
  })

  it('returns 0 when no components defined', () => {
    expect(calcMaxAssemblable([], stock)).toBe(0)
  })

  it('returns 0 when all stock is zero', () => {
    expect(calcMaxAssemblable(components, { 'prod-a': 0, 'prod-b': 0 })).toBe(0)
  })
})

// ── Kit cost calculation ──────────────────────────────────────────────────────

describe('Kit cost calculation', () => {
  it('calculates total component cost for 1 kit', () => {
    // prod-a: 2*5000=10000, prod-b: 3*3000=9000 → 19000
    expect(calcKitCost(components, costs, 1)).toBe(19000)
  })

  it('scales cost linearly with target qty', () => {
    expect(calcKitCost(components, costs, 3)).toBe(57000)
  })

  it('returns 0 for 0 target qty', () => {
    expect(calcKitCost(components, costs, 0)).toBe(0)
  })

  it('treats missing cost entry as zero', () => {
    const cost = calcKitCost(components, { 'prod-a': 5000 }, 1)
    expect(cost).toBe(10000) // only prod-a counted
  })
})

// ── Partial assembly ──────────────────────────────────────────────────────────

describe('Partial assembly', () => {
  it('returns full qty when stock is sufficient', () => {
    const { possible } = calcPartialAssemblable(components, stock, 3)
    expect(possible).toBe(3)
  })

  it('returns max possible when requested exceeds stock', () => {
    // max = 4, requested = 10
    const { possible } = calcPartialAssemblable(components, stock, 10)
    expect(possible).toBe(4)
  })

  it('identifies shortage components for partial run', () => {
    const { shortage } = calcPartialAssemblable(components, { 'prod-a': 10, 'prod-b': 2 }, 2)
    expect(shortage.map(s => s.componentProductId)).toContain('prod-b')
  })

  it('returns 0 possible when all stock is empty', () => {
    const { possible } = calcPartialAssemblable(components, { 'prod-a': 0, 'prod-b': 0 }, 5)
    expect(possible).toBe(0)
  })
})
