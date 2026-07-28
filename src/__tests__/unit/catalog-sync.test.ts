import { describe, it, expect } from 'vitest'
import {
  parseAndValidateCSV,
  findDuplicateSKUs,
  computeImportSummary,
  CSV_HEADERS,
  type ParsedRow,
} from '@/lib/product-import'

// ── Shared helpers (pure functions, no DB) ────────────────────────────────────

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

/** Compute job progress percentage (0–100) */
function computeProgress(processedRows: number, totalRows: number): number {
  if (totalRows <= 0) return 0
  return Math.round((processedRows / totalRows) * 100)
}

/** Generate a CSV template string from CSV_HEADERS */
function generateCSVTemplate(sampleRow?: Record<string, string>): string {
  const header = CSV_HEADERS.join(',')
  if (!sampleRow) return header
  const row = CSV_HEADERS.map(h => escapeCSV(sampleRow[h] ?? '')).join(',')
  return `${header}\r\n${row}`
}

// ── 1. CSV Row Parsing ────────────────────────────────────────────────────────

describe('CSV row parsing', () => {
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

  it('parses multiple rows and assigns sequential rowIndex values', () => {
    const csv =
      'name,sku,price,cost,stock,categoryName\nA,S1,1000,500,10,Cat\nB,S2,2000,800,5,Cat'
    const rows = parseAndValidateCSV(csv)
    expect(rows).toHaveLength(2)
    expect(rows[0].rowIndex).toBe(1)
    expect(rows[1].rowIndex).toBe(2)
  })

  it('skips empty lines in CSV input', () => {
    const csv = 'name,sku,price,cost,stock,categoryName\nA,S1,1000,500,10,Cat\n\n'
    const rows = parseAndValidateCSV(csv)
    expect(rows).toHaveLength(1)
  })
})

// ── 2. Field Validation ───────────────────────────────────────────────────────

describe('Field validation', () => {
  it('flags a row with missing name as invalid', () => {
    const csv = 'name,sku,price,cost,stock,categoryName\n,SKU002,5000,2000,10,Makanan'
    const rows = parseAndValidateCSV(csv)
    expect(rows[0].errors.length).toBeGreaterThan(0)
    expect(rows[0].errors.map(e => e.field)).toContain('name')
  })

  it('flags a row with non-numeric price as invalid', () => {
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

// ── 3. Error Row Detection ────────────────────────────────────────────────────

describe('Error row detection', () => {
  it('returns empty set when no duplicate SKUs exist', () => {
    const csv =
      'name,sku,price,cost,stock,categoryName\nA,SKU001,1000,500,10,Cat\nB,SKU002,2000,800,5,Cat'
    const rows = parseAndValidateCSV(csv)
    expect(findDuplicateSKUs(rows).size).toBe(0)
  })

  it('detects duplicate SKUs within the same batch', () => {
    const csv =
      'name,sku,price,cost,stock,categoryName\nA,SKU001,1000,500,10,Cat\nB,SKU001,2000,800,5,Cat'
    const rows = parseAndValidateCSV(csv)
    expect(findDuplicateSKUs(rows).has('SKU001')).toBe(true)
  })

  it('computes errorCount correctly in import summary', () => {
    const csv =
      'name,sku,price,cost,stock,categoryName\n,SKU-ERR,bad,0,-1,Cat\nOK,SKU001,1000,0,5,Cat'
    const rows = parseAndValidateCSV(csv)
    const summary = computeImportSummary(rows, new Set())
    // First row has multiple errors → counted once as 1 error row
    expect(summary.errorCount).toBeGreaterThanOrEqual(1)
    expect(summary.toCreate).toBe(1)
  })
})

// ── 4. Progress Calculation ───────────────────────────────────────────────────

describe('Progress calculation', () => {
  it('returns 0 when totalRows is 0', () => {
    expect(computeProgress(0, 0)).toBe(0)
  })

  it('returns 50 when half the rows are processed', () => {
    expect(computeProgress(5, 10)).toBe(50)
  })

  it('returns 100 when all rows are processed', () => {
    expect(computeProgress(10, 10)).toBe(100)
  })

  it('rounds fractional progress to nearest integer', () => {
    // 1/3 ≈ 33.33 → rounds to 33
    expect(computeProgress(1, 3)).toBe(33)
  })
})

// ── 5. Template Generation ────────────────────────────────────────────────────

describe('Template generation', () => {
  it('CSV_HEADERS contains all required product columns', () => {
    expect(CSV_HEADERS).toContain('name')
    expect(CSV_HEADERS).toContain('sku')
    expect(CSV_HEADERS).toContain('price')
    expect(CSV_HEADERS).toContain('cost')
    expect(CSV_HEADERS).toContain('stock')
    expect(CSV_HEADERS).toContain('categoryName')
  })

  it('generates a template with header-only when no sample row given', () => {
    const tmpl = generateCSVTemplate()
    expect(tmpl).toBe(CSV_HEADERS.join(','))
    expect(tmpl.includes('\r\n')).toBe(false)
  })

  it('generates a template with a sample row when provided', () => {
    const sample = {
      name: 'Contoh',
      sku: 'SKU001',
      price: '15000',
      cost: '8000',
      stock: '50',
      categoryName: 'Makanan',
    }
    const tmpl = generateCSVTemplate(sample)
    const lines = tmpl.split('\r\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toBe(CSV_HEADERS.join(','))
    expect(lines[1]).toContain('Contoh')
    expect(lines[1]).toContain('SKU001')
  })

  it('escapes commas and quotes in CSV export rows', () => {
    const product = {
      name: 'Kopi, Latte',
      sku: 'KL001',
      price: 28000,
      cost: 12000,
      stock: 30,
      categoryName: 'Minuman "Panas"',
    }
    const row = buildCSVExportRow(product)
    expect(row).toContain('"Kopi, Latte"')
    expect(row).toContain('"Minuman ""Panas"""')
  })
})
