import { describe, it, expect, beforeEach } from 'vitest'

// ── Types ─────────────────────────────────────────────────────────────────────

type MovementType = 'PURCHASE' | 'SALE' | 'ADJUSTMENT' | 'RETURN'
type StockLogType = 'SALE' | 'IN' | 'OUT' | 'ADJUSTMENT' | 'VOID' | 'INITIAL' | 'REFUND'

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
  qty: number // positive = in, negative = out
  note?: string
  createdAt: string
}

interface StockLog {
  type: StockLogType
  qty: number
  createdAt: string // ISO string
}

interface HistoryDay {
  date: string // YYYY-MM-DD
  in: number
  out: number
}

interface CsvRow {
  productId: string
  productName: string
  qty: string
  costPrice: string
}

// ── Pure functions ────────────────────────────────────────────────────────────

function applyStockMovement(
  item: StockItem,
  movement: StockMovement,
): { ok: boolean; item?: StockItem; error?: string } {
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
    header.forEach((h, idx) => {
      row[h] = parts[idx] ?? ''
    })

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

/**
 * Aggregate an array of StockLog entries into per-day { date, in, out } buckets.
 * Mirrors the logic in the API route handler.
 */
function aggregateStockHistory(logs: StockLog[], days: number): HistoryDay[] {
  // Use UTC dates throughout to avoid timezone mismatch
  const nowUtc = new Date()
  const todayUtc = nowUtc.toISOString().slice(0, 10)

  const map = new Map<string, HistoryDay>()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(nowUtc)
    d.setUTCDate(d.getUTCDate() - i)
    const key = d.toISOString().slice(0, 10)
    map.set(key, { date: key, in: 0, out: 0 })
  }

  for (const log of logs) {
    const key = log.createdAt.slice(0, 10)
    const entry = map.get(key)
    if (!entry) continue
    const absQty = Math.abs(Number(log.qty))
    if (
      log.type === 'SALE' ||
      log.type === 'OUT' ||
      (Number(log.qty) < 0 && log.type === 'ADJUSTMENT')
    ) {
      entry.out += absQty
    } else {
      entry.in += absQty
    }
  }

  return Array.from(map.values())
}

/**
 * Simulate the localStorage-based dismiss logic used by the banner.
 */
function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '')
}

function getDismissKey(): string {
  return `low-stock-dismissed-${getTodayKey()}`
}

function shouldShowBanner(lowStockProducts: StockItem[], storage: Record<string, string>): boolean {
  if (lowStockProducts.length === 0) return false
  return storage[getDismissKey()] !== '1'
}

function dismissBanner(storage: Record<string, string>): Record<string, string> {
  return { ...storage, [getDismissKey()]: '1' }
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const baseItem: StockItem = {
  id: 'stock-1',
  productId: 'p1',
  productName: 'Kopi Arabica',
  qty: 10,
  costPrice: 50_000,
  lowStockThreshold: 5,
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Stock adjustment validation', () => {
  it('allows stock increase (PURCHASE movement)', () => {
    const movement: StockMovement = {
      id: 'm1',
      productId: 'p1',
      type: 'PURCHASE',
      qty: 20,
      createdAt: '2025-01-01',
    }
    const result = applyStockMovement(baseItem, movement)
    expect(result.ok).toBe(true)
    expect(result.item?.qty).toBe(30)
  })

  it('allows stock decrease when sufficient qty', () => {
    const movement: StockMovement = {
      id: 'm2',
      productId: 'p1',
      type: 'SALE',
      qty: -5,
      createdAt: '2025-01-01',
    }
    const result = applyStockMovement(baseItem, movement)
    expect(result.ok).toBe(true)
    expect(result.item?.qty).toBe(5)
  })

  it('blocks stock going negative when allowNegative is false', () => {
    const movement: StockMovement = {
      id: 'm3',
      productId: 'p1',
      type: 'SALE',
      qty: -15,
      createdAt: '2025-01-01',
    }
    const result = applyStockMovement(baseItem, movement)
    expect(result.ok).toBe(false)
    expect(result.error).toBe('Stok tidak boleh negatif')
  })

  it('allows stock going negative when allowNegative is true', () => {
    const item = { ...baseItem, allowNegative: true }
    const movement: StockMovement = {
      id: 'm4',
      productId: 'p1',
      type: 'SALE',
      qty: -15,
      createdAt: '2025-01-01',
    }
    const result = applyStockMovement(item, movement)
    expect(result.ok).toBe(true)
    expect(result.item?.qty).toBe(-5)
  })

  it('allows exact depletion to zero', () => {
    const movement: StockMovement = {
      id: 'm5',
      productId: 'p1',
      type: 'SALE',
      qty: -10,
      createdAt: '2025-01-01',
    }
    const result = applyStockMovement(baseItem, movement)
    expect(result.ok).toBe(true)
    expect(result.item?.qty).toBe(0)
  })
})

describe('Low stock detection', () => {
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

  it('out-of-stock item (qty=0) is treated as low stock when threshold >= 0', () => {
    const item = { ...baseItem, qty: 0, lowStockThreshold: 0 }
    expect(isLowStock(item)).toBe(true)
  })
})

describe('Stock history aggregation by date', () => {
  it('pre-fills all days so the array length equals days param', () => {
    const result = aggregateStockHistory([], 30)
    expect(result).toHaveLength(30)
  })

  it('aggregates SALE log into out bucket for the correct date', () => {
    const today = new Date().toISOString().slice(0, 10)
    const logs: StockLog[] = [{ type: 'SALE', qty: -5, createdAt: `${today}T00:00:00.000Z` }]
    const result = aggregateStockHistory(logs, 30)
    const todayEntry = result.find(r => r.date === today)
    expect(todayEntry).toBeDefined()
    expect(todayEntry!.out).toBe(5)
    expect(todayEntry!.in).toBe(0)
  })

  it('aggregates IN/RESTOCK log into in bucket', () => {
    const today = new Date().toISOString().slice(0, 10)
    const logs: StockLog[] = [{ type: 'IN', qty: 20, createdAt: `${today}T00:00:00.000Z` }]
    const result = aggregateStockHistory(logs, 30)
    const todayEntry = result.find(r => r.date === today)
    expect(todayEntry!.in).toBe(20)
    expect(todayEntry!.out).toBe(0)
  })

  it('accumulates multiple logs on the same day', () => {
    const today = new Date().toISOString().slice(0, 10)
    const logs: StockLog[] = [
      { type: 'SALE', qty: -3, createdAt: `${today}T09:00:00.000Z` },
      { type: 'SALE', qty: -7, createdAt: `${today}T14:00:00.000Z` },
      { type: 'IN', qty: 10, createdAt: `${today}T16:00:00.000Z` },
    ]
    const result = aggregateStockHistory(logs, 30)
    const todayEntry = result.find(r => r.date === today)!
    expect(todayEntry.out).toBe(10)
    expect(todayEntry.in).toBe(10)
  })

  it('ignores logs outside the date range', () => {
    // A log 60 days ago should not appear in a 30-day window
    const old = new Date()
    old.setDate(old.getDate() - 60)
    const oldKey = old.toISOString().slice(0, 10)
    const logs: StockLog[] = [{ type: 'SALE', qty: -99, createdAt: `${oldKey}T10:00:00.000Z` }]
    const result = aggregateStockHistory(logs, 30)
    const total = result.reduce((s, r) => s + r.out, 0)
    expect(total).toBe(0)
  })
})

describe('In/out calculation', () => {
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
    const movement: StockMovement = {
      id: 'm6',
      productId: 'p1',
      type: 'RETURN',
      qty: 3,
      createdAt: '2025-01-01',
    }
    const result = applyStockMovement(baseItem, movement)
    expect(result.ok).toBe(true)
    expect(result.item?.qty).toBe(13)
  })
})

describe('Alert dismissal logic', () => {
  it('shows banner when low-stock products exist and not dismissed', () => {
    const storage: Record<string, string> = {}
    const lowItems = [{ ...baseItem, qty: 2 }]
    expect(shouldShowBanner(lowItems, storage)).toBe(true)
  })

  it('hides banner when dismissed for today', () => {
    let storage: Record<string, string> = {}
    const lowItems = [{ ...baseItem, qty: 2 }]
    storage = dismissBanner(storage)
    expect(shouldShowBanner(lowItems, storage)).toBe(false)
  })

  it('hides banner when there are no low-stock products', () => {
    const storage: Record<string, string> = {}
    expect(shouldShowBanner([], storage)).toBe(false)
  })

  it('dismiss key includes today YYYYMMDD', () => {
    const key = getDismissKey()
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    expect(key).toBe(`low-stock-dismissed-${today}`)
  })

  it('dismissing today does not affect a different date key', () => {
    let storage: Record<string, string> = {}
    storage = dismissBanner(storage)
    // Simulate a yesterday key — should still be absent
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const yKey = `low-stock-dismissed-${yesterday.toISOString().slice(0, 10).replace(/-/g, '')}`
    expect(storage[yKey]).toBeUndefined()
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
})

describe('Stock value calculation', () => {
  it('calculates single item stock value', () => {
    expect(calcStockValue(baseItem)).toBe(500_000) // 10 * 50000
  })

  it('calculates total stock value across items', () => {
    const items: StockItem[] = [
      { ...baseItem, id: 's1', qty: 10, costPrice: 50_000 }, // 500_000
      { ...baseItem, id: 's2', qty: 5, costPrice: 20_000 }, // 100_000
    ]
    expect(calcTotalStockValue(items)).toBe(600_000)
  })
})
