import { describe, it, expect } from 'vitest'

// ── Types ─────────────────────────────────────────────────────────────────────

interface VariantAttribute {
  id: string
  name: string
  values: string[]
}

interface ProductVariant {
  id: string
  productId: string
  sku: string
  attributes: Record<string, string>
  price: number
  stock: number
  active: boolean
}

// ── Pure business logic (mirrors VariantMatrixClient exports) ─────────────────

function generateSku(productName: string, attributes: Record<string, string>): string {
  const base = productName
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6)
  const attrPart = Object.values(attributes)
    .map(v => v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3))
    .join('-')
  return attrPart ? `${base}-${attrPart}` : base
}

function generateMatrix(attributes: VariantAttribute[]): Array<Record<string, string>> {
  if (attributes.length === 0) return []
  const [first, ...rest] = attributes
  if (rest.length === 0) {
    return first.values.map(v => ({ [first.name]: v }))
  }
  const sub = generateMatrix(rest)
  return first.values.flatMap(v =>
    sub.map(combo => ({ [first.name]: v, ...combo }))
  )
}

function applyPriceOverride(
  basePrice: number,
  overrides: Record<string, number>,
  variantKey: string,
): number {
  return overrides[variantKey] ?? basePrice
}

function aggregateStock(variants: ProductVariant[]): number {
  return variants.reduce((sum, v) => sum + (v.active ? v.stock : 0), 0)
}

function validateBulkUpdate(
  updates: Array<{ id: string; price?: number; stock?: number }>,
): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  for (const u of updates) {
    if (!u.id) errors.push('Each update must have an id')
    if (u.price !== undefined && u.price < 0) errors.push(`Price cannot be negative (id: ${u.id})`)
    if (u.stock !== undefined && u.stock < 0) errors.push(`Stock cannot be negative (id: ${u.id})`)
  }
  return { valid: errors.length === 0, errors }
}

// ── Test fixtures ─────────────────────────────────────────────────────────────

const sizeAttr: VariantAttribute = { id: 'attr-1', name: 'size', values: ['S', 'M', 'L'] }
const colorAttr: VariantAttribute = { id: 'attr-2', name: 'color', values: ['Red', 'Blue'] }

const sampleVariants: ProductVariant[] = [
  { id: 'v1', productId: 'p1', sku: 'SHIRT-S-RED', attributes: { size: 'S', color: 'Red' }, price: 50000, stock: 10, active: true },
  { id: 'v2', productId: 'p1', sku: 'SHIRT-S-BLU', attributes: { size: 'S', color: 'Blue' }, price: 50000, stock: 5, active: true },
  { id: 'v3', productId: 'p1', sku: 'SHIRT-M-RED', attributes: { size: 'M', color: 'Red' }, price: 55000, stock: 8, active: true },
  { id: 'v4', productId: 'p1', sku: 'SHIRT-L-BLU', attributes: { size: 'L', color: 'Blue' }, price: 60000, stock: 3, active: false },
]

// ── Matrix generation ─────────────────────────────────────────────────────────

describe('Matrix generation from attributes', () => {
  it('generates all combinations for two attributes', () => {
    const combos = generateMatrix([sizeAttr, colorAttr])
    // 3 sizes × 2 colors = 6
    expect(combos).toHaveLength(6)
  })

  it('each combo contains one value per attribute', () => {
    const combos = generateMatrix([sizeAttr, colorAttr])
    for (const combo of combos) {
      expect(Object.keys(combo)).toContain('size')
      expect(Object.keys(combo)).toContain('color')
    }
  })

  it('returns empty array when no attributes given', () => {
    expect(generateMatrix([])).toHaveLength(0)
  })

  it('handles single attribute correctly', () => {
    const combos = generateMatrix([sizeAttr])
    expect(combos).toHaveLength(3)
    expect(combos.map(c => c.size)).toEqual(['S', 'M', 'L'])
  })
})

// ── SKU auto-generation ───────────────────────────────────────────────────────

describe('SKU auto-generation', () => {
  it('generates uppercase SKU from product name and attributes', () => {
    const sku = generateSku('Kaos Polos', { size: 'M', color: 'Red' })
    expect(sku).toMatch(/^KAOSP/)
    expect(sku).toContain('M')
    expect(sku).toContain('RED')
  })

  it('strips special characters from product name portion', () => {
    const sku = generateSku('T-Shirt (Pro)', { size: 'S' })
    // Hyphen is only the separator between base and attr part, not from the name itself
    const base = sku.split('-')[0]
    expect(base).not.toMatch(/[()]/g)
    expect(base).toBe('TSHIRT')
  })

  it('returns base-only SKU when no attributes provided', () => {
    const sku = generateSku('Kemeja', {})
    expect(sku).toBe('KEMEJA')
  })

  it('truncates long product names to 6 characters', () => {
    const sku = generateSku('VeryLongProductName', { color: 'Blue' })
    const base = sku.split('-')[0]
    expect(base.length).toBeLessThanOrEqual(6)
  })
})

// ── Price override logic ──────────────────────────────────────────────────────

describe('Price override logic', () => {
  it('returns override price when key exists', () => {
    const overrides = { 'v1': 45000 }
    expect(applyPriceOverride(50000, overrides, 'v1')).toBe(45000)
  })

  it('returns base price when no override exists', () => {
    expect(applyPriceOverride(50000, {}, 'v-unknown')).toBe(50000)
  })

  it('override of 0 is valid (zero-price variant)', () => {
    const overrides = { 'v-free': 0 }
    expect(applyPriceOverride(50000, overrides, 'v-free')).toBe(0)
  })
})

// ── Stock aggregation ─────────────────────────────────────────────────────────

describe('Stock aggregation across variants', () => {
  it('sums stock only for active variants', () => {
    // v1=10, v2=5, v3=8 active; v4=3 inactive
    expect(aggregateStock(sampleVariants)).toBe(23)
  })

  it('returns 0 when all variants are inactive', () => {
    const all = sampleVariants.map(v => ({ ...v, active: false }))
    expect(aggregateStock(all)).toBe(0)
  })

  it('returns 0 for empty variant list', () => {
    expect(aggregateStock([])).toBe(0)
  })
})

// ── Bulk update validation ────────────────────────────────────────────────────

describe('Bulk update validation', () => {
  it('passes for valid updates', () => {
    const { valid, errors } = validateBulkUpdate([
      { id: 'v1', price: 50000, stock: 10 },
      { id: 'v2', price: 55000, stock: 0 },
    ])
    expect(valid).toBe(true)
    expect(errors).toHaveLength(0)
  })

  it('fails when price is negative', () => {
    const { valid, errors } = validateBulkUpdate([{ id: 'v1', price: -100 }])
    expect(valid).toBe(false)
    expect(errors[0]).toMatch(/negative/)
  })

  it('fails when stock is negative', () => {
    const { valid, errors } = validateBulkUpdate([{ id: 'v1', stock: -1 }])
    expect(valid).toBe(false)
    expect(errors[0]).toMatch(/negative/)
  })

  it('collects multiple errors across updates', () => {
    const { errors } = validateBulkUpdate([
      { id: 'v1', price: -10 },
      { id: 'v2', stock: -5 },
    ])
    expect(errors).toHaveLength(2)
  })

  it('stock of 0 is valid', () => {
    const { valid } = validateBulkUpdate([{ id: 'v1', stock: 0 }])
    expect(valid).toBe(true)
  })
})
