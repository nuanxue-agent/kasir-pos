import { describe, it, expect } from 'vitest'

// ── Types ─────────────────────────────────────────────────────────────────────

type TransferStatus = 'PENDING' | 'IN_TRANSIT' | 'RECEIVED' | 'CANCELLED'

interface TransferItem {
  id: string
  productId: string
  qty: number
  receivedQty?: number | null
}

interface WarehouseStockEntry {
  warehouseId: string
  productId: string
  qty: number
}

// ── Pure helpers (mirrored from API logic) ────────────────────────────────────

const VALID_TRANSITIONS: Record<TransferStatus, TransferStatus[]> = {
  PENDING: ['IN_TRANSIT', 'CANCELLED'],
  IN_TRANSIT: ['RECEIVED', 'CANCELLED'],
  RECEIVED: [],
  CANCELLED: [],
}

function isValidTransition(from: TransferStatus, to: TransferStatus): boolean {
  return (VALID_TRANSITIONS[from] ?? []).includes(to)
}

function validateTransferItems(items: { productId?: string; qty?: number }[]): string | null {
  if (!items || items.length === 0) return 'items must be a non-empty array'
  for (const item of items) {
    if (!item.productId) return 'Each item requires productId'
    if (typeof item.qty !== 'number' || item.qty <= 0) return 'Each item qty must be > 0'
  }
  return null
}

function detectDiscrepancies(items: TransferItem[]): TransferItem[] {
  return items.filter(
    (item) => item.receivedQty !== null && item.receivedQty !== undefined && item.receivedQty !== item.qty,
  )
}

function aggregateWarehouseStock(entries: WarehouseStockEntry[]): Map<string, number> {
  const totals = new Map<string, number>()
  for (const e of entries) {
    totals.set(e.productId, (totals.get(e.productId) ?? 0) + e.qty)
  }
  return totals
}

function totalStockAcrossWarehouses(
  entries: WarehouseStockEntry[],
  productId: string,
): number {
  return entries.filter((e) => e.productId === productId).reduce((sum, e) => sum + e.qty, 0)
}

function applyTransferToStock(
  stock: WarehouseStockEntry[],
  fromWarehouseId: string,
  toWarehouseId: string,
  items: TransferItem[],
): WarehouseStockEntry[] {
  const result = stock.map((s) => ({ ...s }))
  for (const item of items) {
    const received = item.receivedQty ?? item.qty
    const src = result.find((s) => s.warehouseId === fromWarehouseId && s.productId === item.productId)
    const dst = result.find((s) => s.warehouseId === toWarehouseId && s.productId === item.productId)
    if (src) src.qty = Math.max(0, src.qty - item.qty)
    if (dst) dst.qty += received
  }
  return result
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Transfer quantity validation', () => {
  it('rejects empty items array', () => {
    expect(validateTransferItems([])).toBe('items must be a non-empty array')
  })

  it('rejects item with zero qty', () => {
    expect(validateTransferItems([{ productId: 'p1', qty: 0 }])).toMatch(/qty must be/)
  })

  it('rejects item with negative qty', () => {
    expect(validateTransferItems([{ productId: 'p1', qty: -5 }])).toMatch(/qty must be/)
  })

  it('accepts valid items', () => {
    expect(validateTransferItems([{ productId: 'p1', qty: 10 }, { productId: 'p2', qty: 3 }])).toBeNull()
  })
})

describe('Receiving discrepancy detection', () => {
  it('detects partial receipt as discrepancy', () => {
    const items: TransferItem[] = [
      { id: 'i1', productId: 'p1', qty: 10, receivedQty: 8 },
      { id: 'i2', productId: 'p2', qty: 5, receivedQty: 5 },
    ]
    const disc = detectDiscrepancies(items)
    expect(disc).toHaveLength(1)
    expect(disc[0].id).toBe('i1')
  })

  it('returns no discrepancies when all quantities match', () => {
    const items: TransferItem[] = [
      { id: 'i1', productId: 'p1', qty: 10, receivedQty: 10 },
    ]
    expect(detectDiscrepancies(items)).toHaveLength(0)
  })

  it('ignores items with null receivedQty (not yet received)', () => {
    const items: TransferItem[] = [
      { id: 'i1', productId: 'p1', qty: 10, receivedQty: null },
    ]
    expect(detectDiscrepancies(items)).toHaveLength(0)
  })
})

describe('Warehouse stock aggregation', () => {
  it('aggregates stock for the same product across warehouses', () => {
    const entries: WarehouseStockEntry[] = [
      { warehouseId: 'w1', productId: 'p1', qty: 20 },
      { warehouseId: 'w2', productId: 'p1', qty: 15 },
      { warehouseId: 'w1', productId: 'p2', qty: 10 },
    ]
    const totals = aggregateWarehouseStock(entries)
    expect(totals.get('p1')).toBe(35)
    expect(totals.get('p2')).toBe(10)
  })

  it('returns 0 for unknown product', () => {
    const entries: WarehouseStockEntry[] = [
      { warehouseId: 'w1', productId: 'p1', qty: 20 },
    ]
    expect(totalStockAcrossWarehouses(entries, 'p999')).toBe(0)
  })
})

describe('Status transition logic', () => {
  it('allows PENDING -> IN_TRANSIT', () => {
    expect(isValidTransition('PENDING', 'IN_TRANSIT')).toBe(true)
  })

  it('allows PENDING -> CANCELLED', () => {
    expect(isValidTransition('PENDING', 'CANCELLED')).toBe(true)
  })

  it('allows IN_TRANSIT -> RECEIVED', () => {
    expect(isValidTransition('IN_TRANSIT', 'RECEIVED')).toBe(true)
  })

  it('blocks RECEIVED -> PENDING (terminal state)', () => {
    expect(isValidTransition('RECEIVED', 'PENDING')).toBe(false)
  })

  it('blocks CANCELLED -> IN_TRANSIT', () => {
    expect(isValidTransition('CANCELLED', 'IN_TRANSIT')).toBe(false)
  })
})

describe('Multi-warehouse total stock', () => {
  it('sums stock correctly across three warehouses', () => {
    const entries: WarehouseStockEntry[] = [
      { warehouseId: 'w1', productId: 'p1', qty: 10 },
      { warehouseId: 'w2', productId: 'p1', qty: 20 },
      { warehouseId: 'w3', productId: 'p1', qty: 5 },
    ]
    expect(totalStockAcrossWarehouses(entries, 'p1')).toBe(35)
  })

  it('applies transfer and updates both warehouses correctly', () => {
    const stock: WarehouseStockEntry[] = [
      { warehouseId: 'w1', productId: 'p1', qty: 50 },
      { warehouseId: 'w2', productId: 'p1', qty: 10 },
    ]
    const items: TransferItem[] = [{ id: 'i1', productId: 'p1', qty: 20, receivedQty: 18 }]
    const result = applyTransferToStock(stock, 'w1', 'w2', items)
    const w1 = result.find((s) => s.warehouseId === 'w1')
    const w2 = result.find((s) => s.warehouseId === 'w2')
    expect(w1!.qty).toBe(30)  // 50 - 20
    expect(w2!.qty).toBe(28)  // 10 + 18 (received, not sent)
  })
})
