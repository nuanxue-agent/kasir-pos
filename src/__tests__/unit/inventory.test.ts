import { describe, it, expect } from 'vitest'

// ── Inventory business logic ───────────────────────────────────────────────────

type MovementType = 'PURCHASE' | 'SALE' | 'ADJUSTMENT' | 'RETURN'

interface StockItem {
  id: string
  productId: string
  productName: string
  qty: number
  costPrice: number
  lowStockThreshold: number
  allowNegative?: boolean
}

interface StockMovement {
  id: string
  productId: string
  type: MovementType
  qty: number        // positive = in, negative = out
  note?: string
  createdAt: string
}

interface CsvRow {
  productId: string
  productName: string
  qty: string
  costPrice: string
}

// ── Pure functions ──────────────────────────────────────────────────────────────

function applyStockMovement(item: StockItem, movement: StockMovement): { ok: boolean; item?: StockItem; error?: string } {
  const newQty = item.qty + movement.qty
  if (newQty < 0 && !item.allowNegative) {
    return { ok: false, error: 'Stok tidak boleh negatif' }
  }
  return { ok: true, item: { ...item, qty: newQty } }
}

function isLowStock(item: StockItem): boolean {
  return item.qty <= item.lowStockThreshold
}

function calcStockValue(item: StockItem): number {
  return item.qty * item.costPrice
}

function calcTotalStockValue(items: StockItem[]): number {
  return items.reduce((sum, i) => sum + calcStockValue(i), 0)
}

function getMovementSign(type: MovementType): number {
  // PURCHASE and RETURN increase stock; SALE and ADJUSTMENT (negative) decrease
  if (type === 'PURCHASE' || type === 'RETURN') return 1
  return -1
}

function parseCsvRows(raw: string): { rows: CsvRow[]; errors: string[] } {
  const lines = raw.trim().split('\n')
  const header = lines[0].split(',').map(h => h.trim())
  const expectedHeaders = ['productId', 'productName', 'qty', 'costPrice']
  const missingHeaders = expectedHeaders.filter(h => !header.includes(h))
  if (missingHeaders.length > 0) {
    return { rows: [], errors: [`Missing columns: ${missingHeaders.join(', ')}`] }
  }

  const rows: CsvRow[] = []
  const errors: string[] = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const parts = line.split(',').map(p => p.trim())
    const row: any = {}
    header.forEach((h, idx) => { row[h] = parts[idx] ?? '' })

    if (isNaN(Number(row.qty))) {
      errors.push(`Row ${i}: qty is not a number`)
      continue
    }
    if (isNaN(Number(row.costPrice))) {
      errors.push(`Row ${i}: costPrice is not a number`)
      continue
    }
    rows.push(row as CsvRow)
  }

  return { rows, errors }
}

function getLowStockItems(items: StockItem[]): StockItem[] {
  return items.filter(isLowStock)
}

// ── Tests ───────────────────────────────────────────────────────────────────────

const baseItem: StockItem = {
  id: 'stock-1',
  productId: 'p1',
  productName: 'Kopi Arabica',
  qty: 10,
  costPrice: 50_000,
  lowStockThreshold: 5,
}

describe('Stock adjustment validation', () => {
  it('allows stock increase (PURCHASE movement)', () => {
    const movement: StockMovement = { id: 'm1', productId: 'p1', type: 'PURCHASE', qty: 20, createdAt: '2025-01-01' }
    const result = applyStockMovement(baseItem, movement)
    expect(result.ok).toBe(true)
    expect(result.item?.qty).toBe(30)
  })

  it('allows stock decrease when sufficient qty', () => {
    const movement: StockMovement = { id: 'm2', productId: 'p1', type: 'SALE', qty: -5, createdAt: '2025-01-01' }
    const result = applyStockMovement(baseItem, movement)
    expect(result.ok).toBe(true)
    expect(result.item?.qty).toBe(5)
  })

  it('blocks stock going negative when allowNegative is false', () => {
    const movement: StockMovement = { id: 'm3', productId: 'p1', type: 'SALE', qty: -15, createdAt: '2025-01-01' }
    const result = applyStockMovement(baseItem, movement)
    expect(result.ok).toBe(false)
    expect(result.error).toBe('Stok tidak boleh negatif')
  })

  it('allows stock going negative when allowNegative is true', () => {
    const item = { ...baseItem, allowNegative: true }
    const movement: StockMovement = { id: 'm4', productId: 'p1', type: 'SALE', qty: -15, createdAt: '2025-01-01' }
    const result = applyStockMovement(item, movement)
    expect(result.ok).toBe(true)
    expect(result.item?.qty).toBe(-5)
  })

  it('allows exact depletion to zero', () => {
    const movement: StockMovement = { id: 'm5', productId: 'p1', type: 'SALE', qty: -10, createdAt: '2025-01-01' }
    const result = applyStockMovement(baseItem, movement)
    expect(result.ok).toBe(true)
    expect(result.item?.qty).toBe(0)
  })
})

describe('Low stock threshold detection', () => {
  it('detects item at threshold as low stock', () => {
    const item = { ...baseItem, qty: 5 }
    expect(isLowStock(item)).toBe(true)
  })

  it('detects item below threshold as low stock', () => {
    const item = { ...baseItem, qty: 2 }
    expect(isLowStock(item)).toBe(true)
  })

  it('item above threshold is not low stock', () => {
    const item = { ...baseItem, qty: 6 }
    expect(isLowStock(item)).toBe(false)
  })

  it('filters all low-stock items from a list', () => {
    const items: StockItem[] = [
      { ...baseItem, id: 's1', qty: 2 },
      { ...baseItem, id: 's2', qty: 10 },
      { ...baseItem, id: 's3', qty: 0 },
    ]
    const low = getLowStockItems(items)
    expect(low).toHaveLength(2)
    expect(low.map(i => i.id)).toContain('s1')
    expect(low.map(i => i.id)).toContain('s3')
  })
})

describe('Stock movement types', () => {
  it('PURCHASE movement has positive sign', () => {
    expect(getMovementSign('PURCHASE')).toBe(1)
  })

  it('SALE movement has negative sign', () => {
    expect(getMovementSign('SALE')).toBe(-1)
  })

  it('ADJUSTMENT movement has negative sign', () => {
    expect(getMovementSign('ADJUSTMENT')).toBe(-1)
  })

  it('RETURN movement has positive sign', () => {
    expect(getMovementSign('RETURN')).toBe(1)
  })

  it('applies RETURN movement correctly — increases stock', () => {
    const movement: StockMovement = { id: 'm6', productId: 'p1', type: 'RETURN', qty: 3, createdAt: '2025-01-01' }
    const result = applyStockMovement(baseItem, movement)
    expect(result.ok).toBe(true)
    expect(result.item?.qty).toBe(13)
  })
})

describe('Bulk stock import CSV parsing', () => {
  it('parses valid CSV correctly', () => {
    const csv = `productId,productName,qty,costPrice\np1,Kopi Arabica,100,50000\np2,Teh Hijau,200,15000`
    const { rows, errors } = parseCsvRows(csv)
    expect(errors).toHaveLength(0)
    expect(rows).toHaveLength(2)
    expect(rows[0].productId).toBe('p1')
    expect(rows[1].qty).toBe('200')
  })

  it('returns error for missing required column', () => {
    const csv = `productId,productName,qty\np1,Kopi,100`
    const { rows, errors } = parseCsvRows(csv)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]).toContain('costPrice')
    expect(rows).toHaveLength(0)
  })

  it('returns row-level error for non-numeric qty', () => {
    const csv = `productId,productName,qty,costPrice\np1,Kopi,abc,50000`
    const { rows, errors } = parseCsvRows(csv)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]).toContain('qty')
  })

  it('returns row-level error for non-numeric costPrice', () => {
    const csv = `productId,productName,qty,costPrice\np1,Kopi,100,expensive`
    const { rows, errors } = parseCsvRows(csv)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]).toContain('costPrice')
  })

  it('skips empty lines in CSV', () => {
    const csv = `productId,productName,qty,costPrice\np1,Kopi,100,50000\n\np2,Teh,50,10000`
    const { rows, errors } = parseCsvRows(csv)
    expect(errors).toHaveLength(0)
    expect(rows).toHaveLength(2)
  })
})

describe('Stock value calculation', () => {
  it('calculates single item stock value', () => {
    expect(calcStockValue(baseItem)).toBe(500_000) // 10 * 50000
  })

  it('returns 0 for zero-quantity item', () => {
    const item = { ...baseItem, qty: 0 }
    expect(calcStockValue(item)).toBe(0)
  })

  it('calculates total stock value across items', () => {
    const items: StockItem[] = [
      { ...baseItem, id: 's1', qty: 10, costPrice: 50_000 },   // 500_000
      { ...baseItem, id: 's2', qty: 5,  costPrice: 20_000 },   // 100_000
    ]
    expect(calcTotalStockValue(items)).toBe(600_000)
  })

  it('total stock value is 0 for empty list', () => {
    expect(calcTotalStockValue([])).toBe(0)
  })
})
