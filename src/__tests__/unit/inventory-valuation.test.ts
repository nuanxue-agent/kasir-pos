import { describe, it, expect } from 'vitest'
import {
  calcFIFOCost,
  calcAVCOCost,
  calcLIFOCost,
  calcCOGSTotal,
  calcInventoryValueRemaining,
  aggregateCOGSByPeriod,
} from '@/components/inventory/InventoryValuationClient'
import type { COGSEntry } from '@/components/inventory/InventoryValuationClient'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeLayer(remainingQty: number, costPrice: number) {
  return { remainingQty, costPrice }
}

function makeCOGSEntry(overrides: Partial<COGSEntry> = {}): COGSEntry {
  return {
    id: 'cogs-1',
    storeId: 'store-1',
    productId: 'prod-1',
    productName: 'Produk A',
    qty: 5,
    costPrice: 10000,
    totalCost: 50000,
    orderId: null,
    soldAt: '2024-06-15T10:00:00Z',
    ...overrides,
  }
}

// ── FIFO cost calculation ─────────────────────────────────────────────────────

describe('calcFIFOCost', () => {
  it('uses oldest layer first', () => {
    const layers = [makeLayer(10, 1000), makeLayer(10, 2000)]
    // sell 10 → takes all from first layer at 1000 each
    expect(calcFIFOCost(layers, 10)).toBe(10000)
  })

  it('spans across multiple layers', () => {
    const layers = [makeLayer(5, 1000), makeLayer(10, 2000)]
    // sell 8 → 5@1000 + 3@2000 = 5000 + 6000 = 11000
    expect(calcFIFOCost(layers, 8)).toBe(11000)
  })

  it('returns 0 for zero qty', () => {
    const layers = [makeLayer(10, 1000)]
    expect(calcFIFOCost(layers, 0)).toBe(0)
  })
})

// ── AVCO cost calculation ─────────────────────────────────────────────────────

describe('calcAVCOCost', () => {
  it('uses weighted average cost', () => {
    const layers = [makeLayer(10, 1000), makeLayer(10, 3000)]
    // avg = (10*1000 + 10*3000) / 20 = 2000; sell 5 → 10000
    expect(calcAVCOCost(layers, 5)).toBe(10000)
  })

  it('handles single layer (avg = cost)', () => {
    const layers = [makeLayer(20, 5000)]
    expect(calcAVCOCost(layers, 4)).toBe(20000)
  })

  it('returns 0 for empty layers', () => {
    expect(calcAVCOCost([], 5)).toBe(0)
  })
})

// ── LIFO cost calculation ─────────────────────────────────────────────────────

describe('calcLIFOCost', () => {
  it('uses newest layer first', () => {
    const layers = [makeLayer(10, 1000), makeLayer(10, 2000)]
    // sell 10 → takes all from last layer at 2000 each
    expect(calcLIFOCost(layers, 10)).toBe(20000)
  })

  it('spans across multiple layers in reverse', () => {
    const layers = [makeLayer(10, 1000), makeLayer(5, 2000)]
    // sell 8 → 5@2000 + 3@1000 = 10000 + 3000 = 13000
    expect(calcLIFOCost(layers, 8)).toBe(13000)
  })

  it('returns 0 for zero qty', () => {
    const layers = [makeLayer(10, 1000)]
    expect(calcLIFOCost(layers, 0)).toBe(0)
  })
})

// ── COGS total calculation ────────────────────────────────────────────────────

describe('calcCOGSTotal', () => {
  it('sums totalCost across all entries', () => {
    const entries = [
      makeCOGSEntry({ totalCost: 50000 }),
      makeCOGSEntry({ id: 'cogs-2', totalCost: 30000 }),
      makeCOGSEntry({ id: 'cogs-3', totalCost: 20000 }),
    ]
    expect(calcCOGSTotal(entries)).toBe(100000)
  })

  it('returns 0 for empty entries', () => {
    expect(calcCOGSTotal([])).toBe(0)
  })
})

// ── Inventory value remaining ─────────────────────────────────────────────────

describe('calcInventoryValueRemaining', () => {
  it('multiplies remainingQty by costPrice for each layer and sums', () => {
    const layers = [makeLayer(10, 2000), makeLayer(5, 4000)]
    // 10*2000 + 5*4000 = 20000 + 20000 = 40000
    expect(calcInventoryValueRemaining(layers)).toBe(40000)
  })

  it('returns 0 for empty layers', () => {
    expect(calcInventoryValueRemaining([])).toBe(0)
  })
})

// ── COGS aggregation by period ────────────────────────────────────────────────

describe('aggregateCOGSByPeriod', () => {
  it('groups entries by YYYY-MM period', () => {
    const entries = [
      makeCOGSEntry({ id: 'c1', soldAt: '2024-06-01T00:00:00Z', totalCost: 10000, qty: 2 }),
      makeCOGSEntry({ id: 'c2', soldAt: '2024-06-15T00:00:00Z', totalCost: 20000, qty: 3 }),
      makeCOGSEntry({ id: 'c3', soldAt: '2024-07-01T00:00:00Z', totalCost: 15000, qty: 1 }),
    ]
    const report = aggregateCOGSByPeriod(entries)
    const june = report.find(r => r.period === '2024-06')
    const july = report.find(r => r.period === '2024-07')
    expect(june?.totalCost).toBe(30000)
    expect(june?.totalQty).toBe(5)
    expect(june?.entryCount).toBe(2)
    expect(july?.totalCost).toBe(15000)
  })

  it('sorts periods descending (newest first)', () => {
    const entries = [
      makeCOGSEntry({ id: 'c1', soldAt: '2024-05-01T00:00:00Z', totalCost: 5000, qty: 1 }),
      makeCOGSEntry({ id: 'c2', soldAt: '2024-07-01T00:00:00Z', totalCost: 8000, qty: 1 }),
      makeCOGSEntry({ id: 'c3', soldAt: '2024-06-01T00:00:00Z', totalCost: 6000, qty: 1 }),
    ]
    const report = aggregateCOGSByPeriod(entries)
    expect(report[0].period).toBe('2024-07')
    expect(report[1].period).toBe('2024-06')
    expect(report[2].period).toBe('2024-05')
  })

  it('returns empty array for no entries', () => {
    expect(aggregateCOGSByPeriod([])).toEqual([])
  })
})
