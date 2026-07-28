import { describe, it, expect } from 'vitest'
import {
  generateBinCode,
  calcCapacityUtilization,
  calcAvailableSpace,
  validateTransfer,
  findBinsByProduct,
  type BinLocation,
  type BinProduct,
} from '@/lib/bin-locations'

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeBin(overrides: Partial<BinLocation> = {}): BinLocation {
  return {
    id: 'bin1',
    warehouseId: 'wh1',
    storeId: 'store1',
    code: 'A-01-B-001',
    aisle: 'A',
    rack: '01',
    shelf: 'B',
    bin: '001',
    capacity: 100,
    currentQty: 40,
    active: true,
    createdAt: '2026-07-28T00:00:00Z',
    ...overrides,
  }
}

function makeBinProduct(overrides: Partial<BinProduct> = {}): BinProduct {
  return {
    id: 'bp1',
    binId: 'bin1',
    storeId: 'store1',
    productId: 'prod1',
    qty: 10,
    ...overrides,
  }
}

// ── Bin Code Generation ───────────────────────────────────────────────────────

describe('generateBinCode', () => {
  it('joins segments with dashes', () => {
    expect(generateBinCode('A', '01', 'B', '001')).toBe('A-01-B-001')
  })

  it('uppercases all segments', () => {
    expect(generateBinCode('a', 'b', 'c', 'd')).toBe('A-B-C-D')
  })

  it('handles numeric-only segments', () => {
    expect(generateBinCode('1', '2', '3', '4')).toBe('1-2-3-4')
  })
})

// ── Capacity Utilization ──────────────────────────────────────────────────────

describe('calcCapacityUtilization', () => {
  it('returns 0 when capacity is 0', () => {
    expect(calcCapacityUtilization(50, 0)).toBe(0)
  })

  it('returns correct percentage', () => {
    expect(calcCapacityUtilization(40, 100)).toBe(40)
  })

  it('caps at 100 when over capacity', () => {
    expect(calcCapacityUtilization(150, 100)).toBe(100)
  })

  it('returns 0 for empty bin', () => {
    expect(calcCapacityUtilization(0, 100)).toBe(0)
  })
})

// ── Available Space ───────────────────────────────────────────────────────────

describe('calcAvailableSpace', () => {
  it('returns remaining space', () => {
    expect(calcAvailableSpace(40, 100)).toBe(60)
  })

  it('returns 0 when bin is full', () => {
    expect(calcAvailableSpace(100, 100)).toBe(0)
  })

  it('returns 0 when over-filled (never negative)', () => {
    expect(calcAvailableSpace(110, 100)).toBe(0)
  })
})

// ── Transfer Validation ───────────────────────────────────────────────────────

describe('validateTransfer', () => {
  it('approves a valid transfer', () => {
    const result = validateTransfer(10, 40, 60)
    expect(result.valid).toBe(true)
  })

  it('rejects qty of 0', () => {
    const result = validateTransfer(0, 40, 60)
    expect(result.valid).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('rejects when qty exceeds source stock', () => {
    const result = validateTransfer(50, 40, 60)
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/sumber/i)
  })

  it('rejects when destination has insufficient space', () => {
    const result = validateTransfer(30, 40, 20)
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/tujuan/i)
  })

  it('approves exact-match qty against source stock', () => {
    const result = validateTransfer(40, 40, 40)
    expect(result.valid).toBe(true)
  })
})

// ── Bin Search by Product ─────────────────────────────────────────────────────

describe('findBinsByProduct', () => {
  const products: BinProduct[] = [
    makeBinProduct({ id: 'bp1', binId: 'bin1', productId: 'prod1', qty: 10 }),
    makeBinProduct({ id: 'bp2', binId: 'bin2', productId: 'prod2', qty: 5 }),
    makeBinProduct({ id: 'bp3', binId: 'bin3', productId: 'prod1', qty: 0 }),
    makeBinProduct({ id: 'bp4', binId: 'bin4', productId: 'prod1', qty: 20 }),
  ]

  it('finds all bins containing a product with qty > 0', () => {
    const result = findBinsByProduct(products, 'prod1')
    expect(result).toHaveLength(2)
    expect(result.map(r => r.binId)).toEqual(['bin1', 'bin4'])
  })

  it('excludes bins where qty is 0', () => {
    const result = findBinsByProduct(products, 'prod1')
    expect(result.every(r => r.qty > 0)).toBe(true)
  })

  it('returns empty array when product not found', () => {
    const result = findBinsByProduct(products, 'prod-unknown')
    expect(result).toHaveLength(0)
  })
})
