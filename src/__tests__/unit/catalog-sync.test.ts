import { describe, it, expect } from 'vitest'
import {
  parseAndValidateCSV,
  findDuplicateSKUs,
  computeImportSummary,
  CSV_HEADERS,
  type ParsedRow,
} from '@/lib/product-import'

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALID_SOURCES = ['TOKOPEDIA', 'SHOPEE', 'MANUAL'] as const
type ExternalSource = (typeof VALID_SOURCES)[number]

function validateSyncSource(source: string): source is ExternalSource {
  return VALID_SOURCES.includes(source as ExternalSource)
}

function escapeCSV(value: string | number | null | undefined): string {
  const str = value == null ? '' : String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function buildCSVExportRow(p: {
  name: string
  sku?: string
  price: number
  cost: number
  stock: number
  categoryName?: string
}): string {
  return [p.name, p.sku ?? '', p.price, p.cost, p.stock, p.categoryName ?? '']
    .map(escapeCSV)
    .join(',')
}

function mapCSVRowToProduct(row: Record<string, string>) {
  return {
    name: (row['name'] ?? '').trim(),
    sku: (row['sku'] ?? '').trim(),
    price: parseFloat(row['price'] ?? '0') || 0,
    cost: parseFloat(row['cost'] ?? '0') || 0,
    stock: parseInt(row['stock'] ?? '0', 10) || 0,
    categoryName: (row['categoryname'] ?? row['categoryName'] ?? row['category'] ?? '').trim(),
  }
}

// ── CSV Row Validation ────────────────────────────────────────────────────────

describe('CSV row validation', () => {
  it('parses a valid CSV row with all fields', () => {
    const csv = 'name,sku,price,cost,stock,categoryName\nEspresso,ESP001,25000,10000,100,Minuman'
    const rows = parseAndValidateCSV(csv)
    expect(rows).toHaveLength(1)
    expect(rows[0].errors).toHaveLength(0)
    expect(rows[0].data.name).toBe('Espresso')
    expect(rows[0].data.sku).toBe('ESP001')
    expect(rows[0].data.price).toBe(25000)
    expect(rows[0].data.stock).toBe(100)
  })

  it('flags a row with missing name as invalid', () => {
    const csv = 'name,sku,price,cost,stock,categoryName\n,SKU002,5000,2000,10,Makanan'
    const rows = parseAndValidateCSV(csv)
    expect(rows[0].errors.length).toBeGreaterThan(0)
    const errFields = rows[0].errors.map(e => e.field)
    expect(errFields).toContain('name')
  })

  it('flags a row with invalid price as invalid', () => {
    const csv = 'name,sku,price,cost,stock,categoryName\nProduk,SKU003,abc,2000,10,Makanan'
    const rows = parseAndValidateCSV(csv)
    expect(rows[0].errors.some(e => e.field === 'price')).toBe(true)
  })

  it('flags a row with negative stock as invalid', () => {
    const csv = 'name,sku,price,cost,stock,categoryName\nProduk,SKU004,5000,2000,-5,Makanan'
    const rows = parseAndValidateCSV(csv)
    expect(rows[0].errors.some(e => e.field === 'stock')).toBe(true)
  })
})

// ── Duplicate SKU Detection ───────────────────────────────────────────────────

describe('Duplicate SKU detection', () => {
  it('returns empty set when no duplicates', () => {
    const csv = 'name,sku,price,cost,stock,categoryName\nA,SKU001,1000,500,10,Cat\nB,SKU002,2000,800,5,Cat'
    const rows = parseAndValidateCSV(csv)
    const dupes = findDuplicateSKUs(rows)
    expect(dupes.size).toBe(0)
  })

  it('detects duplicate SKUs in same batch', () => {
    const csv = 'name,sku,price,cost,stock,categoryName\nA,SKU001,1000,500,10,Cat\nB,SKU001,2000,800,5,Cat'
    const rows = parseAndValidateCSV(csv)
    const dupes = findDuplicateSKUs(rows)
    expect(dupes.has('SKU001')).toBe(true)
  })

  it('detects existing SKU collision with store inventory', () => {
    const csv = 'name,sku,price,cost,stock,categoryName\nA,EXISTING,1000,500,10,Cat'
    const rows = parseAndValidateCSV(csv)
    const existing = new Set(['EXISTING'])
    const summary = computeImportSummary(rows, existing)
    expect(summary.toUpdate).toBe(1)
    expect(summary.toCreate).toBe(0)
  })
})

// ── Import Row Mapping ────────────────────────────────────────────────────────

describe('Import row mapping (CSV columns to product fields)', () => {
  it('maps standard CSV columns correctly', () => {
    const raw = { name: 'Nasi Goreng', sku: 'NG001', price: '18000', cost: '8000', stock: '50', categoryname: 'Makanan' }
    const product = mapCSVRowToProduct(raw)
    expect(product.name).toBe('Nasi Goreng')
    expect(product.sku).toBe('NG001')
    expect(product.price).toBe(18000)
    expect(product.cost).toBe(8000)
    expect(product.stock).toBe(50)
    expect(product.categoryName).toBe('Makanan')
  })

  it('defaults missing numeric fields to 0', () => {
    const raw = { name: 'Teh Manis', sku: '', price: '', cost: '', stock: '', categoryname: '' }
    const product = mapCSVRowToProduct(raw)
    expect(product.price).toBe(0)
    expect(product.cost).toBe(0)
    expect(product.stock).toBe(0)
  })

  it('trims whitespace from string fields', () => {
    const raw = { name: '  Kopi Hitam  ', sku: '  KH001  ', price: '5000', cost: '2000', stock: '20', categoryname: '  Minuman  ' }
    const product = mapCSVRowToProduct(raw)
    expect(product.name).toBe('Kopi Hitam')
    expect(product.sku).toBe('KH001')
    expect(product.categoryName).toBe('Minuman')
  })
})

// ── Export Format Validation ──────────────────────────────────────────────────

describe('Export format validation', () => {
  it('CSV_HEADERS contains required columns', () => {
    expect(CSV_HEADERS).toContain('name')
    expect(CSV_HEADERS).toContain('sku')
    expect(CSV_HEADERS).toContain('price')
    expect(CSV_HEADERS).toContain('cost')
    expect(CSV_HEADERS).toContain('stock')
    expect(CSV_HEADERS).toContain('categoryName')
  })

  it('escapes commas in product names for CSV', () => {
    const result = escapeCSV('Kopi, Latte')
    expect(result).toBe('"Kopi, Latte"')
  })

  it('escapes double-quotes in CSV values', () => {
    const result = escapeCSV('Produk "Spesial"')
    expect(result).toBe('"Produk ""Spesial"""')
  })

  it('builds a valid CSV export row from a product object', () => {
    const product = { name: 'Tahu Goreng', sku: 'TG001', price: 3000, cost: 1500, stock: 200, categoryName: 'Gorengan' }
    const row = buildCSVExportRow(product)
    const cols = row.split(',')
    expect(cols[0]).toBe('Tahu Goreng')
    expect(cols[1]).toBe('TG001')
    expect(cols[2]).toBe('3000')
  })
})

// ── Sync Source Validation ────────────────────────────────────────────────────

describe('Sync source validation', () => {
  it('accepts TOKOPEDIA as a valid source', () => {
    expect(validateSyncSource('TOKOPEDIA')).toBe(true)
  })

  it('accepts SHOPEE as a valid source', () => {
    expect(validateSyncSource('SHOPEE')).toBe(true)
  })

  it('accepts MANUAL as a valid source', () => {
    expect(validateSyncSource('MANUAL')).toBe(true)
  })

  it('rejects an unknown source string', () => {
    expect(validateSyncSource('LAZADA')).toBe(false)
    expect(validateSyncSource('')).toBe(false)
    expect(validateSyncSource('tokopedia')).toBe(false)
  })
})
