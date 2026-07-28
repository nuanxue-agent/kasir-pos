import { describe, it, expect } from 'vitest'
import {
  generateCombinations,
  attrKey,
  findVariant,
  generateSKU,
  bulkUpdatePrice,
  bulkUpdateStock,
  type ProductVariant,
} from '@/components/products/VariantMatrixClient'

// ── Test data helpers ─────────────────────────────────────────────────────

const sizeAttr = { name: 'Size', values: ['S', 'M', 'L', 'XL'] }
const colorAttr = { name: 'Color', values: ['Red', 'Blue', 'Green'] }
const materialAttr = { name: 'Material', values: ['Cotton', 'Polyester'] }

function makeVariant(attrs: Record<string, string>, price = 0, stock = 0): ProductVariant {
  return {
    productId: 'prod-001',
    attributes: attrs,
    sku: generateSKU('prod-001', attrs),
    price,
    stock,
    active: true,
  }
}

// ── 1. Attribute combination generation ──────────────────────────────────

describe('generateCombinations', () => {
  it('returns empty array for no attributes', () => {
    expect(generateCombinations([])).toEqual([])
  })

  it('returns single-level combinations for one attribute', () => {
    const result = generateCombinations([sizeAttr])
    expect(result).toHaveLength(4)
    expect(result[0]).toEqual({ Size: 'S' })
    expect(result[3]).toEqual({ Size: 'XL' })
  })

  it('returns cartesian product for two attributes', () => {
    const result = generateCombinations([sizeAttr, colorAttr])
    // 4 sizes × 3 colors = 12 combinations
    expect(result).toHaveLength(12)
  })

  it('returns correct combination count for three attributes', () => {
    const result = generateCombinations([sizeAttr, colorAttr, materialAttr])
    // 4 × 3 × 2 = 24
    expect(result).toHaveLength(24)
  })

  it('each combination contains all attribute keys', () => {
    const result = generateCombinations([sizeAttr, colorAttr])
    for (const combo of result) {
      expect(combo).toHaveProperty('Size')
      expect(combo).toHaveProperty('Color')
    }
  })

  it('ignores attributes with empty values array', () => {
    const emptyAttr = { name: 'Empty', values: [] }
    const result = generateCombinations([sizeAttr, emptyAttr])
    // emptyAttr filtered out → same as single attr
    expect(result).toHaveLength(4)
  })
})

// ── 2. Combination count validation ──────────────────────────────────────

describe('combination count validation', () => {
  it('counts correctly: 2×2 = 4', () => {
    const a = { name: 'A', values: ['a1', 'a2'] }
    const b = { name: 'B', values: ['b1', 'b2'] }
    expect(generateCombinations([a, b])).toHaveLength(4)
  })

  it('counts correctly: 1×1×1 = 1', () => {
    const attrs = [
      { name: 'X', values: ['x1'] },
      { name: 'Y', values: ['y1'] },
      { name: 'Z', values: ['z1'] },
    ]
    expect(generateCombinations(attrs)).toHaveLength(1)
  })
})

// ── 3. Matrix cell lookup ─────────────────────────────────────────────────

describe('findVariant', () => {
  const variants: ProductVariant[] = [
    makeVariant({ Size: 'S', Color: 'Red' }, 50000, 10),
    makeVariant({ Size: 'M', Color: 'Blue' }, 60000, 5),
    makeVariant({ Size: 'L', Color: 'Green' }, 70000, 0),
  ]

  it('finds a variant by exact attributes', () => {
    const result = findVariant(variants, { Size: 'S', Color: 'Red' })
    expect(result).toBeDefined()
    expect(result?.price).toBe(50000)
    expect(result?.stock).toBe(10)
  })

  it('returns undefined for non-existent combination', () => {
    const result = findVariant(variants, { Size: 'XL', Color: 'Red' })
    expect(result).toBeUndefined()
  })

  it('is order-independent for attribute keys', () => {
    const result = findVariant(variants, { Color: 'Blue', Size: 'M' })
    expect(result).toBeDefined()
    expect(result?.price).toBe(60000)
  })
})

// ── 4. SKU auto-generation ────────────────────────────────────────────────

describe('generateSKU', () => {
  it('includes product id prefix', () => {
    const sku = generateSKU('prod-001', { Size: 'M' })
    expect(sku).toMatch(/^PROD-0/)
  })

  it('includes attribute values in SKU', () => {
    const sku = generateSKU('prod-001', { Size: 'M', Color: 'Red' })
    expect(sku).toContain('M')
    expect(sku).toContain('RED')
  })

  it('produces different SKUs for different combinations', () => {
    const sku1 = generateSKU('prod-001', { Size: 'S', Color: 'Red' })
    const sku2 = generateSKU('prod-001', { Size: 'L', Color: 'Blue' })
    expect(sku1).not.toBe(sku2)
  })
})

// ── 5. Bulk price update ──────────────────────────────────────────────────

describe('bulkUpdatePrice', () => {
  const variants: ProductVariant[] = [
    makeVariant({ Size: 'S', Color: 'Red' }, 50000),
    makeVariant({ Size: 'M', Color: 'Red' }, 50000),
    makeVariant({ Size: 'S', Color: 'Blue' }, 50000),
    makeVariant({ Size: 'M', Color: 'Blue' }, 50000),
  ]

  it('updates all variants matching the attribute value', () => {
    const updated = bulkUpdatePrice(variants, 'Color', 'Red', 99000)
    const redVariants = updated.filter(v => v.attributes.Color === 'Red')
    const blueVariants = updated.filter(v => v.attributes.Color === 'Blue')
    expect(redVariants.every(v => v.price === 99000)).toBe(true)
    expect(blueVariants.every(v => v.price === 50000)).toBe(true)
  })

  it('does not mutate the original array', () => {
    bulkUpdatePrice(variants, 'Size', 'S', 12345)
    expect(variants[0].price).toBe(50000)
  })

  it('handles no matches gracefully', () => {
    const updated = bulkUpdatePrice(variants, 'Color', 'Green', 99000)
    expect(updated.map(v => v.price)).toEqual(variants.map(v => v.price))
  })
})

// ── 6. Bulk stock update ──────────────────────────────────────────────────

describe('bulkUpdateStock', () => {
  const variants: ProductVariant[] = [
    makeVariant({ Size: 'S' }, 0, 10),
    makeVariant({ Size: 'M' }, 0, 20),
    makeVariant({ Size: 'L' }, 0, 5),
  ]

  it('updates stock for matching attribute value', () => {
    const updated = bulkUpdateStock(variants, 'Size', 'M', 100)
    expect(updated.find(v => v.attributes.Size === 'M')?.stock).toBe(100)
    expect(updated.find(v => v.attributes.Size === 'S')?.stock).toBe(10)
  })
})

// ── 7. attrKey consistency ─────────────────────────────────────────────────

describe('attrKey', () => {
  it('produces consistent keys regardless of object insertion order', () => {
    const key1 = attrKey({ Size: 'M', Color: 'Red' })
    const key2 = attrKey({ Color: 'Red', Size: 'M' })
    expect(key1).toBe(key2)
  })

  it('produces different keys for different attribute values', () => {
    const key1 = attrKey({ Size: 'S', Color: 'Red' })
    const key2 = attrKey({ Size: 'M', Color: 'Red' })
    expect(key1).not.toBe(key2)
  })
})
