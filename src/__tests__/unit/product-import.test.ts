import { describe, it, expect } from 'vitest'
import {
  parseCSV,
  parseAndValidateCSV,
  parseIDRPrice,
  validateRow,
  findDuplicateSKUs,
  computeImportSummary,
  CSV_HEADERS,
} from '@/lib/product-import'

// ─── 1. CSV parsing — well-formed CSV ─────────────────────────────────────────
describe('parseCSV', () => {
  it('parses a simple CSV with headers', () => {
    const csv = 'name,sku,price\nKopi,SKU-1,15000\nTeh,SKU-2,10000'
    const rows = parseCSV(csv)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({ name: 'Kopi', sku: 'SKU-1', price: '15000' })
    expect(rows[1]).toEqual({ name: 'Teh', sku: 'SKU-2', price: '10000' })
  })

  it('handles quoted fields with commas', () => {
    const csv = 'name,sku,price\n"Kopi, Arabica",SKU-1,25000'
    const rows = parseCSV(csv)
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('Kopi, Arabica')
  })

  it('skips empty lines', () => {
    const csv = 'name,sku,price\nKopi,SKU-1,15000\n\n\nTeh,SKU-2,10000'
    const rows = parseCSV(csv)
    expect(rows).toHaveLength(2)
  })

  it('returns empty array for CSV with only headers', () => {
    const csv = 'name,sku,price'
    expect(parseCSV(csv)).toHaveLength(0)
  })

  it('normalises headers to lowercase', () => {
    const csv = 'Name,SKU,Price\nKopi,SKU-1,15000'
    const rows = parseCSV(csv)
    expect(rows[0]).toHaveProperty('name', 'Kopi')
    expect(rows[0]).toHaveProperty('sku', 'SKU-1')
    expect(rows[0]).toHaveProperty('price', '15000')
  })
})

// ─── 2. IDR price parsing ─────────────────────────────────────────────────────
describe('parseIDRPrice', () => {
  it('parses a plain integer string', () => {
    expect(parseIDRPrice('15000')).toBe(15000)
  })

  it('parses IDR format with dots as thousand separator', () => {
    expect(parseIDRPrice('15.000')).toBe(15000)
    expect(parseIDRPrice('1.500.000')).toBe(1500000)
  })

  it('parses Rp prefix', () => {
    expect(parseIDRPrice('Rp 25.000')).toBe(25000)
    expect(parseIDRPrice('Rp. 10000')).toBe(10000)
  })

  it('returns null for non-numeric strings', () => {
    expect(parseIDRPrice('abc')).toBeNull()
    expect(parseIDRPrice('--')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseIDRPrice('')).toBeNull()
  })
})

// ─── 3. Validation — missing required fields ──────────────────────────────────
describe('validateRow — missing required fields', () => {
  it('errors when name is missing', () => {
    const result = validateRow({ name: '', sku: 'SKU-1', price: '15000' }, 1)
    expect(result.errors.some((e) => e.field === 'name')).toBe(true)
  })

  it('errors when price is missing', () => {
    const result = validateRow({ name: 'Kopi', sku: 'SKU-1', price: '' }, 1)
    expect(result.errors.some((e) => e.field === 'price')).toBe(true)
  })

  it('errors when price is invalid text', () => {
    const result = validateRow({ name: 'Kopi', sku: 'SKU-1', price: 'gratis' }, 1)
    expect(result.errors.some((e) => e.field === 'price')).toBe(true)
  })

  it('passes when all required fields are present', () => {
    const result = validateRow({ name: 'Kopi', sku: 'SKU-1', price: '15000' }, 1)
    expect(result.errors).toHaveLength(0)
  })

  it('allows missing cost (defaults to 0)', () => {
    const result = validateRow({ name: 'Kopi', sku: 'SKU-1', price: '15000', cost: '' }, 1)
    expect(result.errors.some((e) => e.field === 'cost')).toBe(false)
    expect(result.data.cost).toBe(0)
  })
})

// ─── 4. Duplicate SKU detection ───────────────────────────────────────────────
describe('findDuplicateSKUs', () => {
  it('detects duplicate SKUs within a batch', () => {
    const rows = parseAndValidateCSV(
      'name,sku,price\nKopi,SKU-1,15000\nTeh,SKU-1,10000\nJus,SKU-2,20000',
    )
    const dupes = findDuplicateSKUs(rows)
    expect(dupes.has('SKU-1')).toBe(true)
    expect(dupes.has('SKU-2')).toBe(false)
  })

  it('returns empty set when no duplicates', () => {
    const rows = parseAndValidateCSV(
      'name,sku,price\nKopi,SKU-1,15000\nTeh,SKU-2,10000',
    )
    expect(findDuplicateSKUs(rows).size).toBe(0)
  })

  it('ignores rows with empty SKU (they cannot be matched)', () => {
    const rows = parseAndValidateCSV(
      'name,sku,price\nKopi,,15000\nTeh,,10000',
    )
    expect(findDuplicateSKUs(rows).size).toBe(0)
  })
})

// ─── 5. Import summary / category matching ────────────────────────────────────
describe('computeImportSummary', () => {
  it('counts new vs update vs error correctly', () => {
    const rows = parseAndValidateCSV(
      'name,sku,price\nKopi,SKU-NEW,15000\nTeh,SKU-EXIST,10000\n,SKU-ERR,',
    )
    const existing = new Set(['SKU-EXIST'])
    const summary = computeImportSummary(rows, existing)
    expect(summary.toCreate).toBe(1)
    expect(summary.toUpdate).toBe(1)
    expect(summary.errorCount).toBe(1) // missing name AND price
  })

  it('CSV_HEADERS contains required columns', () => {
    expect(CSV_HEADERS).toContain('name')
    expect(CSV_HEADERS).toContain('sku')
    expect(CSV_HEADERS).toContain('price')
    expect(CSV_HEADERS).toContain('categoryName')
  })
})
