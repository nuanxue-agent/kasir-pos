import { describe, it, expect } from 'vitest'

// ── Types ─────────────────────────────────────────────────────────────────────

type OpnameStatus = 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED'

interface OpnameSession {
  id: string
  storeId: string
  status: OpnameStatus
  startedAt: string
  completedAt: string | null
  notes: string | null
}

interface OpnameItem {
  id: string
  opnameId: string
  productId: string
  systemQty: number
  countedQty: number | null
  variance: number
}

interface Product {
  id: string
  name: string
  sku: string | null
  barcode: string | null
  stock: number
}

// ── Pure functions (mirrors what the API / component does) ────────────────────

function calcVariance(systemQty: number, countedQty: number): number {
  return countedQty - systemQty
}

function computeSessionVariance(items: OpnameItem[]): number {
  return items.reduce((sum, i) => sum + (i.variance ?? 0), 0)
}

function canTransition(from: OpnameStatus, to: OpnameStatus): boolean {
  const allowed: Record<OpnameStatus, OpnameStatus[]> = {
    DRAFT: ['IN_PROGRESS'],
    IN_PROGRESS: ['COMPLETED'],
    COMPLETED: [],
  }
  return allowed[from].includes(to)
}

function transitionSession(
  session: OpnameSession,
  to: OpnameStatus,
  now: string,
): OpnameSession | { error: string } {
  if (!canTransition(session.status, to)) {
    return { error: `Cannot transition from ${session.status} to ${to}` }
  }
  return {
    ...session,
    status: to,
    completedAt: to === 'COMPLETED' ? now : session.completedAt,
  }
}

function buildStockAdjustments(
  items: OpnameItem[],
): { productId: string; delta: number }[] {
  return items
    .filter(i => i.countedQty !== null && i.variance !== 0)
    .map(i => ({ productId: i.productId, delta: i.variance }))
}

function applyAdjustments(
  products: Product[],
  adjustments: { productId: string; delta: number }[],
): Product[] {
  return products.map(p => {
    const adj = adjustments.find(a => a.productId === p.id)
    if (!adj) return p
    return { ...p, stock: p.stock + adj.delta }
  })
}

function lookupByBarcode(products: Product[], code: string): Product | undefined {
  return products.find(p => p.barcode === code || p.sku === code)
}

function validateSubmit(items: OpnameItem[]): string | null {
  const unfilled = items.filter(i => i.countedQty === null)
  if (unfilled.length > 0) return `${unfilled.length} item(s) not counted`
  return null
}

function buildOpnameItems(
  opnameId: string,
  products: Product[],
): OpnameItem[] {
  return products.map((p, idx) => ({
    id: `item-${idx}`,
    opnameId,
    productId: p.id,
    systemQty: p.stock,
    countedQty: null,
    variance: 0,
  }))
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('Stock Opname — Variance Calculation', () => {
  it('returns 0 when counted equals system qty', () => {
    expect(calcVariance(10, 10)).toBe(0)
  })

  it('returns positive variance when counted exceeds system qty', () => {
    expect(calcVariance(5, 8)).toBe(3)
  })

  it('returns negative variance when counted is less than system qty', () => {
    expect(calcVariance(10, 7)).toBe(-3)
  })

  it('computes total session variance from items', () => {
    const items: OpnameItem[] = [
      { id: '1', opnameId: 's1', productId: 'p1', systemQty: 10, countedQty: 12, variance: 2 },
      { id: '2', opnameId: 's1', productId: 'p2', systemQty: 5, countedQty: 3, variance: -2 },
      { id: '3', opnameId: 's1', productId: 'p3', systemQty: 8, countedQty: 8, variance: 0 },
    ]
    expect(computeSessionVariance(items)).toBe(0)
  })

  it('accumulates all-positive variances correctly', () => {
    const items: OpnameItem[] = [
      { id: '1', opnameId: 's1', productId: 'p1', systemQty: 5, countedQty: 7, variance: 2 },
      { id: '2', opnameId: 's1', productId: 'p2', systemQty: 3, countedQty: 6, variance: 3 },
    ]
    expect(computeSessionVariance(items)).toBe(5)
  })
})

describe('Stock Opname — Session Status Transitions', () => {
  const baseSession: OpnameSession = {
    id: 'sess-1',
    storeId: 'store-1',
    status: 'DRAFT',
    startedAt: '2026-01-01T08:00:00.000Z',
    completedAt: null,
    notes: null,
  }

  it('allows DRAFT → IN_PROGRESS', () => {
    expect(canTransition('DRAFT', 'IN_PROGRESS')).toBe(true)
  })

  it('allows IN_PROGRESS → COMPLETED', () => {
    expect(canTransition('IN_PROGRESS', 'COMPLETED')).toBe(true)
  })

  it('disallows DRAFT → COMPLETED directly', () => {
    expect(canTransition('DRAFT', 'COMPLETED')).toBe(false)
  })

  it('disallows COMPLETED → any', () => {
    expect(canTransition('COMPLETED', 'IN_PROGRESS')).toBe(false)
    expect(canTransition('COMPLETED', 'DRAFT')).toBe(false)
  })

  it('sets completedAt when transitioning to COMPLETED', () => {
    const inProgress = { ...baseSession, status: 'IN_PROGRESS' as OpnameStatus }
    const now = '2026-01-01T12:00:00.000Z'
    const result = transitionSession(inProgress, 'COMPLETED', now)
    expect('error' in result).toBe(false)
    if (!('error' in result)) {
      expect(result.completedAt).toBe(now)
      expect(result.status).toBe('COMPLETED')
    }
  })

  it('returns error for invalid transition', () => {
    const result = transitionSession(baseSession, 'COMPLETED', '')
    expect('error' in result).toBe(true)
  })
})

describe('Stock Opname — Stock Adjustment on Submit', () => {
  const products: Product[] = [
    { id: 'p1', name: 'Produk A', sku: 'SKU-A', barcode: '1234567890', stock: 10 },
    { id: 'p2', name: 'Produk B', sku: 'SKU-B', barcode: '0987654321', stock: 5 },
    { id: 'p3', name: 'Produk C', sku: 'SKU-C', barcode: null, stock: 20 },
  ]

  it('builds correct adjustments for items with variance', () => {
    const items: OpnameItem[] = [
      { id: 'i1', opnameId: 's1', productId: 'p1', systemQty: 10, countedQty: 8, variance: -2 },
      { id: 'i2', opnameId: 's1', productId: 'p2', systemQty: 5, countedQty: 5, variance: 0 },
      { id: 'i3', opnameId: 's1', productId: 'p3', systemQty: 20, countedQty: 22, variance: 2 },
    ]
    const adjs = buildStockAdjustments(items)
    expect(adjs).toHaveLength(2)
    expect(adjs.find(a => a.productId === 'p1')?.delta).toBe(-2)
    expect(adjs.find(a => a.productId === 'p3')?.delta).toBe(2)
  })

  it('applies adjustments to product stock', () => {
    const adjs = [
      { productId: 'p1', delta: -2 },
      { productId: 'p3', delta: 2 },
    ]
    const updated = applyAdjustments(products, adjs)
    expect(updated.find(p => p.id === 'p1')?.stock).toBe(8)
    expect(updated.find(p => p.id === 'p2')?.stock).toBe(5) // unchanged
    expect(updated.find(p => p.id === 'p3')?.stock).toBe(22)
  })

  it('buildOpnameItems initialises items from products with null countedQty', () => {
    const items = buildOpnameItems('sess-1', products)
    expect(items).toHaveLength(3)
    items.forEach(item => {
      expect(item.countedQty).toBeNull()
      expect(item.variance).toBe(0)
    })
  })

  it('validateSubmit rejects when any item is uncounted', () => {
    const items: OpnameItem[] = [
      { id: 'i1', opnameId: 's1', productId: 'p1', systemQty: 10, countedQty: 9, variance: -1 },
      { id: 'i2', opnameId: 's1', productId: 'p2', systemQty: 5, countedQty: null, variance: 0 },
    ]
    expect(validateSubmit(items)).not.toBeNull()
  })

  it('validateSubmit passes when all items are counted', () => {
    const items: OpnameItem[] = [
      { id: 'i1', opnameId: 's1', productId: 'p1', systemQty: 10, countedQty: 9, variance: -1 },
      { id: 'i2', opnameId: 's1', productId: 'p2', systemQty: 5, countedQty: 5, variance: 0 },
    ]
    expect(validateSubmit(items)).toBeNull()
  })
})

describe('Stock Opname — Barcode Lookup', () => {
  const products: Product[] = [
    { id: 'p1', name: 'Produk A', sku: 'SKU-A', barcode: '1234567890', stock: 10 },
    { id: 'p2', name: 'Produk B', sku: 'SKU-B', barcode: null, stock: 5 },
    { id: 'p3', name: 'Produk C', sku: null, barcode: '5555555555', stock: 8 },
  ]

  it('finds product by barcode', () => {
    const result = lookupByBarcode(products, '1234567890')
    expect(result?.id).toBe('p1')
  })

  it('finds product by SKU when barcode is null', () => {
    const result = lookupByBarcode(products, 'SKU-B')
    expect(result?.id).toBe('p2')
  })

  it('finds product by barcode when SKU is null', () => {
    const result = lookupByBarcode(products, '5555555555')
    expect(result?.id).toBe('p3')
  })

  it('returns undefined for unknown code', () => {
    const result = lookupByBarcode(products, 'UNKNOWN')
    expect(result).toBeUndefined()
  })
})
