import { describe, it, expect, vi } from 'vitest'

// ── Types (mirrors BarcodeScannerClient) ──────────────────────────────────

interface Product {
  id: string
  name: string
  price: number
  cost: number
  stock: number
  trackStock: boolean
  sku?: string | null
  barcode?: string | null
}

interface LabelConfig {
  showProductName: boolean
  showPrice: boolean
  showBarcode: boolean
  showStoreName: boolean
  storeName: string
  copies: number
}

interface LabelData {
  id: string
  name: string
  price: number
  sku?: string | null
  barcode?: string | null
  category?: string | null
  labelCode: string
}

interface ScanLogEntry {
  id: string
  barcode: string
  productId: string | null
  productName: string | null
  scannedAt: string
  action: 'LOOKUP' | 'ADD_TO_CART' | 'NOT_FOUND'
}

// ── Pure helpers (extracted from component / API logic) ───────────────────

function resolveLabelCode(product: Pick<Product, 'id' | 'sku' | 'barcode'>): string {
  return product.barcode ?? product.sku ?? product.id
}

function formatLabelData(row: any): LabelData {
  return {
    id: row.id,
    name: row.name,
    price: row.price,
    sku: row.sku ?? null,
    barcode: row.barcode ?? null,
    category: row.categoryName ?? null,
    labelCode: row.barcode ?? row.sku ?? row.id,
  }
}

function buildBatchLabelData(rows: any[]): LabelData[] {
  return rows.map(formatLabelData)
}

function validateBarcode(barcode: string): string | null {
  if (!barcode || !barcode.trim()) return 'Barcode harus diisi'
  if (barcode.trim().length > 128) return 'Barcode terlalu panjang (maks 128 karakter)'
  return null
}

function validateScanLogEntry(entry: Partial<ScanLogEntry>): string | null {
  if (!entry.barcode) return 'barcode is required'
  if (!entry.action) return 'action is required'
  const validActions = ['LOOKUP', 'ADD_TO_CART', 'NOT_FOUND']
  if (!validActions.includes(entry.action!)) return 'invalid action'
  if (!entry.scannedAt) return 'scannedAt is required'
  return null
}

function buildPosDeepLink(product: Product): string {
  const code = product.barcode ?? product.sku ?? product.id
  return `/dashboard/pos?barcode=${encodeURIComponent(code)}&productId=${product.id}`
}

function filterProductsByCode(
  products: Product[],
  code: string,
): Product | null {
  const q = code.toLowerCase()
  return (
    products.find(p => p.barcode?.toLowerCase() === q) ??
    products.find(p => p.sku?.toLowerCase() === q) ??
    null
  )
}

async function stubRequestCameraPermission(
  getUserMedia: (c: MediaStreamConstraints) => Promise<MediaStream>,
): Promise<'granted' | 'denied' | 'unavailable'> {
  try {
    await getUserMedia({ video: { facingMode: 'environment' } as any })
    return 'granted'
  } catch (e: any) {
    if (e?.name === 'NotAllowedError') return 'denied'
    return 'unavailable'
  }
}

// ── 1. Barcode lookup — exact barcode match ───────────────────────────────

describe('Barcode lookup logic', () => {
  const products: Product[] = [
    { id: 'p1', name: 'Kopi Arabica', price: 25000, cost: 15000, stock: 50, trackStock: true, sku: 'SKU-001', barcode: '8991234560001' },
    { id: 'p2', name: 'Teh Hijau', price: 18000, cost: 10000, stock: 30, trackStock: true, sku: 'SKU-002', barcode: null },
    { id: 'p3', name: 'Gula Pasir', price: 14000, cost: 8000, stock: 0, trackStock: true, sku: null, barcode: null },
  ]

  it('finds product by exact barcode', () => {
    const result = filterProductsByCode(products, '8991234560001')
    expect(result?.id).toBe('p1')
  })

  it('finds product by SKU when barcode not set', () => {
    const result = filterProductsByCode(products, 'SKU-002')
    expect(result?.id).toBe('p2')
  })

  it('returns null when code matches nothing', () => {
    const result = filterProductsByCode(products, 'UNKNOWN-999')
    expect(result).toBeNull()
  })

  it('lookup is case-insensitive', () => {
    const result = filterProductsByCode(products, 'sku-001')
    expect(result?.id).toBe('p1')
  })
})

// ── 2. Label data formatting ──────────────────────────────────────────────

describe('Label data formatting', () => {
  it('formats a complete product row into LabelData', () => {
    const row = { id: 'p1', name: 'Kopi Arabica', price: 25000, sku: 'SKU-001', barcode: '8991234560001', categoryName: 'Minuman' }
    const label = formatLabelData(row)
    expect(label.id).toBe('p1')
    expect(label.name).toBe('Kopi Arabica')
    expect(label.labelCode).toBe('8991234560001')
    expect(label.category).toBe('Minuman')
  })

  it('falls back to SKU as labelCode when barcode is absent', () => {
    const row = { id: 'p2', name: 'Teh Hijau', price: 18000, sku: 'SKU-002', barcode: null, categoryName: null }
    const label = formatLabelData(row)
    expect(label.labelCode).toBe('SKU-002')
  })

  it('falls back to id as labelCode when both barcode and sku are absent', () => {
    const row = { id: 'p3', name: 'Gula', price: 14000, sku: null, barcode: null, categoryName: null }
    const label = formatLabelData(row)
    expect(label.labelCode).toBe('p3')
  })
})

// ── 3. Batch label generation ─────────────────────────────────────────────

describe('Batch label generation', () => {
  it('maps multiple rows into LabelData array', () => {
    const rows = [
      { id: 'a', name: 'A', price: 1000, sku: 'SKU-A', barcode: 'BAR-A', categoryName: 'Cat1' },
      { id: 'b', name: 'B', price: 2000, sku: 'SKU-B', barcode: null, categoryName: null },
    ]
    const labels = buildBatchLabelData(rows)
    expect(labels).toHaveLength(2)
    expect(labels[0].labelCode).toBe('BAR-A')
    expect(labels[1].labelCode).toBe('SKU-B')
  })

  it('returns empty array for empty input', () => {
    expect(buildBatchLabelData([])).toEqual([])
  })

  it('resolveLabelCode priority: barcode > sku > id', () => {
    expect(resolveLabelCode({ id: 'x', sku: 'SKU-X', barcode: 'BAR-X' })).toBe('BAR-X')
    expect(resolveLabelCode({ id: 'x', sku: 'SKU-X', barcode: null })).toBe('SKU-X')
    expect(resolveLabelCode({ id: 'x', sku: null, barcode: null })).toBe('x')
  })
})

// ── 4. Scan log validation ────────────────────────────────────────────────

describe('Scan log validation', () => {
  it('accepts a valid LOOKUP entry', () => {
    const entry: Partial<ScanLogEntry> = {
      barcode: '1234567890',
      action: 'LOOKUP',
      scannedAt: new Date().toISOString(),
      productId: 'p1',
    }
    expect(validateScanLogEntry(entry)).toBeNull()
  })

  it('rejects entry missing barcode', () => {
    expect(validateScanLogEntry({ action: 'LOOKUP', scannedAt: new Date().toISOString() })).toBe('barcode is required')
  })

  it('rejects entry with invalid action', () => {
    const entry = { barcode: 'X', action: 'INVALID' as any, scannedAt: new Date().toISOString() }
    expect(validateScanLogEntry(entry)).toBe('invalid action')
  })

  it('rejects entry missing scannedAt', () => {
    expect(validateScanLogEntry({ barcode: 'X', action: 'NOT_FOUND' })).toBe('scannedAt is required')
  })
})

// ── 5. Barcode value validation ───────────────────────────────────────────

describe('Barcode value validation', () => {
  it('accepts a valid EAN-13 barcode', () => {
    expect(validateBarcode('8991234560001')).toBeNull()
  })

  it('rejects empty string', () => {
    expect(validateBarcode('')).toBe('Barcode harus diisi')
  })

  it('rejects whitespace-only', () => {
    expect(validateBarcode('   ')).toBe('Barcode harus diisi')
  })

  it('rejects string exceeding 128 chars', () => {
    expect(validateBarcode('A'.repeat(129))).toBe('Barcode terlalu panjang (maks 128 karakter)')
  })
})

// ── 6. Camera permission handling stub ───────────────────────────────────

describe('Camera permission handling stub', () => {
  it('returns granted when getUserMedia resolves', async () => {
    const fakeGetUserMedia = vi.fn().mockResolvedValue({} as MediaStream)
    const result = await stubRequestCameraPermission(fakeGetUserMedia)
    expect(result).toBe('granted')
    expect(fakeGetUserMedia).toHaveBeenCalledWith({ video: { facingMode: 'environment' } })
  })

  it('returns denied when NotAllowedError is thrown', async () => {
    const err = Object.assign(new Error('denied'), { name: 'NotAllowedError' })
    const fakeGetUserMedia = vi.fn().mockRejectedValue(err)
    const result = await stubRequestCameraPermission(fakeGetUserMedia)
    expect(result).toBe('denied')
  })

  it('returns unavailable for other errors', async () => {
    const fakeGetUserMedia = vi.fn().mockRejectedValue(new Error('no camera'))
    const result = await stubRequestCameraPermission(fakeGetUserMedia)
    expect(result).toBe('unavailable')
  })
})

// ── 7. POS deep link generation ───────────────────────────────────────────

describe('POS deep link generation', () => {
  it('builds link using barcode when available', () => {
    const p: Product = { id: 'p1', name: 'A', price: 1000, cost: 500, stock: 10, trackStock: true, barcode: 'BAR-1', sku: 'SKU-1' }
    expect(buildPosDeepLink(p)).toBe('/dashboard/pos?barcode=BAR-1&productId=p1')
  })

  it('URL-encodes special characters in barcode', () => {
    const p: Product = { id: 'p2', name: 'B', price: 2000, cost: 1000, stock: 5, trackStock: true, barcode: 'BAR 2&X', sku: null }
    const link = buildPosDeepLink(p)
    expect(link).toContain(encodeURIComponent('BAR 2&X'))
  })
})
