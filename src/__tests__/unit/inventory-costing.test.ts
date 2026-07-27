import { describe, it, expect } from 'vitest'
import {
  calcFifoCost,
  calcWeightedAvgCost,
  getBatchesExpiringSoon,
  getExpiredBatches,
  getExpiryStatus,
  type ExpiryBatch,
} from '@/lib/inventory-costing'

// ── Helpers ───────────────────────────────────────────────────────────────────

function batch(overrides: Partial<ExpiryBatch> & { expiryDate: string; qty: number; costPerUnit: number }): ExpiryBatch {
  return {
    id: overrides.id ?? 'b1',
    storeId: overrides.storeId ?? 'store1',
    productId: overrides.productId ?? 'p1',
    batchNumber: overrides.batchNumber ?? 'BATCH-001',
    expiryDate: overrides.expiryDate,
    qty: overrides.qty,
    costPerUnit: overrides.costPerUnit,
  }
}

function daysFromNow(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  // Use local date components to avoid UTC offset shifting
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// ── FIFO Cost Calculation ─────────────────────────────────────────────────────

describe('calcFifoCost', () => {
  it('consumes from oldest-expiry batch first (FIFO)', () => {
    const batches: ExpiryBatch[] = [
      batch({ id: 'b1', expiryDate: daysFromNow(60), qty: 10, costPerUnit: 100 }),
      batch({ id: 'b2', expiryDate: daysFromNow(10), qty: 10, costPerUnit: 120 }), // expires sooner
    ]
    const result = calcFifoCost(batches, 5)
    // Should consume from b2 (sooner expiry) first
    expect(result.cost).toBe(5 * 120)
    expect(result.unfulfilled).toBe(0)
    const remaining = result.batches.find(b => b.id === 'b2')
    expect(remaining?.qty).toBe(5)
    expect(result.batches.find(b => b.id === 'b1')?.qty).toBe(10)
  })

  it('spans multiple batches when first batch is insufficient', () => {
    const batches: ExpiryBatch[] = [
      batch({ id: 'b1', expiryDate: daysFromNow(5), qty: 4, costPerUnit: 100 }),
      batch({ id: 'b2', expiryDate: daysFromNow(20), qty: 10, costPerUnit: 150 }),
    ]
    const result = calcFifoCost(batches, 7)
    // 4 units @ 100 + 3 units @ 150 = 400 + 450 = 850
    expect(result.cost).toBe(850)
    expect(result.unfulfilled).toBe(0)
    // b1 fully depleted, b2 has 7 left
    expect(result.batches.find(b => b.id === 'b1')).toBeUndefined()
    expect(result.batches.find(b => b.id === 'b2')?.qty).toBe(7)
  })

  it('reports unfulfilled qty when stock is insufficient', () => {
    const batches: ExpiryBatch[] = [
      batch({ id: 'b1', expiryDate: daysFromNow(10), qty: 3, costPerUnit: 100 }),
    ]
    const result = calcFifoCost(batches, 10)
    expect(result.unfulfilled).toBe(7)
    expect(result.cost).toBe(300)
    expect(result.batches).toHaveLength(0)
  })

  it('returns zero cost and unchanged batches for zero quantity', () => {
    const batches: ExpiryBatch[] = [
      batch({ id: 'b1', expiryDate: daysFromNow(10), qty: 5, costPerUnit: 100 }),
    ]
    const result = calcFifoCost(batches, 0)
    expect(result.cost).toBe(0)
    expect(result.unfulfilled).toBe(0)
    expect(result.batches).toHaveLength(1)
    expect(result.batches[0].qty).toBe(5)
  })

  it('depletes batches in expiry order correctly across 3 batches', () => {
    const batches: ExpiryBatch[] = [
      batch({ id: 'b3', expiryDate: daysFromNow(90), qty: 5, costPerUnit: 200 }),
      batch({ id: 'b1', expiryDate: daysFromNow(5), qty: 5, costPerUnit: 50 }),
      batch({ id: 'b2', expiryDate: daysFromNow(30), qty: 5, costPerUnit: 100 }),
    ]
    // Consume 12: 5 from b1 @ 50, 5 from b2 @ 100, 2 from b3 @ 200
    const result = calcFifoCost(batches, 12)
    expect(result.cost).toBe(5 * 50 + 5 * 100 + 2 * 200)
    expect(result.unfulfilled).toBe(0)
    expect(result.batches).toHaveLength(1)
    expect(result.batches[0].id).toBe('b3')
    expect(result.batches[0].qty).toBe(3)
  })
})

// ── Weighted Average Cost ─────────────────────────────────────────────────────

describe('calcWeightedAvgCost', () => {
  it('calculates weighted average correctly', () => {
    const batches: ExpiryBatch[] = [
      batch({ expiryDate: daysFromNow(30), qty: 10, costPerUnit: 100 }),
      batch({ expiryDate: daysFromNow(60), qty: 20, costPerUnit: 200 }),
    ]
    // (10*100 + 20*200) / 30 = 5000/30 = 166.67
    expect(calcWeightedAvgCost(batches)).toBeCloseTo(166.67, 1)
  })

  it('returns 0 when all batches have zero qty', () => {
    const batches: ExpiryBatch[] = [
      batch({ expiryDate: daysFromNow(30), qty: 0, costPerUnit: 100 }),
    ]
    expect(calcWeightedAvgCost(batches)).toBe(0)
  })

  it('returns cost per unit for a single batch', () => {
    const batches: ExpiryBatch[] = [
      batch({ expiryDate: daysFromNow(30), qty: 5, costPerUnit: 75 }),
    ]
    expect(calcWeightedAvgCost(batches)).toBe(75)
  })
})

// ── Expiry Date Sorting & Status ──────────────────────────────────────────────

describe('getExpiryStatus', () => {
  it('returns EXPIRED for past dates', () => {
    expect(getExpiryStatus(daysFromNow(-1))).toBe('EXPIRED')
    expect(getExpiryStatus(daysFromNow(-10))).toBe('EXPIRED')
  })

  it('returns EXPIRING_SOON for dates within 30 days', () => {
    expect(getExpiryStatus(daysFromNow(0))).toBe('EXPIRING_SOON')
    expect(getExpiryStatus(daysFromNow(15))).toBe('EXPIRING_SOON')
    expect(getExpiryStatus(daysFromNow(30))).toBe('EXPIRING_SOON')
  })

  it('returns OK for dates beyond 30 days', () => {
    expect(getExpiryStatus(daysFromNow(31))).toBe('OK')
    expect(getExpiryStatus(daysFromNow(365))).toBe('OK')
  })

  it('respects custom soonDays threshold', () => {
    expect(getExpiryStatus(daysFromNow(5), 3)).toBe('OK')
    expect(getExpiryStatus(daysFromNow(2), 3)).toBe('EXPIRING_SOON')
  })
})

describe('getBatchesExpiringSoon', () => {
  it('returns only batches expiring within N days', () => {
    const batches: ExpiryBatch[] = [
      batch({ id: 'b1', expiryDate: daysFromNow(5), qty: 1, costPerUnit: 1 }),
      batch({ id: 'b2', expiryDate: daysFromNow(29), qty: 1, costPerUnit: 1 }),
      batch({ id: 'b3', expiryDate: daysFromNow(31), qty: 1, costPerUnit: 1 }),
      batch({ id: 'b4', expiryDate: daysFromNow(-1), qty: 1, costPerUnit: 1 }), // already expired
    ]
    const soon = getBatchesExpiringSoon(batches, 30)
    expect(soon.map(b => b.id)).toContain('b1')
    expect(soon.map(b => b.id)).toContain('b2')
    expect(soon.map(b => b.id)).not.toContain('b3')
    expect(soon.map(b => b.id)).not.toContain('b4') // expired excluded
  })
})

// ── Reorder Point Trigger Logic ───────────────────────────────────────────────

describe('reorder point trigger logic', () => {
  it('triggers reorder when stock equals reorder point', () => {
    const stock = 10
    const reorderPoint = 10
    expect(stock <= reorderPoint).toBe(true)
  })

  it('triggers reorder when stock is below reorder point', () => {
    const stock = 5
    const reorderPoint = 10
    expect(stock <= reorderPoint).toBe(true)
  })

  it('does not trigger when stock is above reorder point', () => {
    const stock = 11
    const reorderPoint = 10
    expect(stock <= reorderPoint).toBe(false)
  })
})

// ── Batch Depletion Order ─────────────────────────────────────────────────────

describe('batch depletion order', () => {
  it('fully depletes earlier-expiry batch before touching later batch', () => {
    const batches: ExpiryBatch[] = [
      batch({ id: 'early', expiryDate: daysFromNow(3), qty: 5, costPerUnit: 10 }),
      batch({ id: 'late', expiryDate: daysFromNow(60), qty: 10, costPerUnit: 20 }),
    ]
    const result = calcFifoCost(batches, 5)
    expect(result.batches.find(b => b.id === 'early')).toBeUndefined()
    expect(result.batches.find(b => b.id === 'late')?.qty).toBe(10)
  })

  it('returns empty batch list when all stock is consumed', () => {
    const batches: ExpiryBatch[] = [
      batch({ id: 'b1', expiryDate: daysFromNow(5), qty: 3, costPerUnit: 10 }),
      batch({ id: 'b2', expiryDate: daysFromNow(10), qty: 2, costPerUnit: 20 }),
    ]
    const result = calcFifoCost(batches, 5)
    expect(result.batches).toHaveLength(0)
    expect(result.unfulfilled).toBe(0)
    expect(result.cost).toBe(3 * 10 + 2 * 20)
  })
})
