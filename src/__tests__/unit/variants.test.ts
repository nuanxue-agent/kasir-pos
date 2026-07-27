import { describe, it, expect } from 'vitest'
import {
  generateCombinations,
  generateSkuSuffix,
  calcFinalPrice,
  formatCartLine,
} from '@/lib/variants'

// ── Variant combination generation ──────────────────────────────────────────

describe('Variant combination generation', () => {
  it('generates combinations for a single attribute', () => {
    const combos = generateCombinations([{ name: 'Ukuran', values: 'S, M, L' }])
    expect(combos).toHaveLength(3)
    expect(combos.map(c => c.key)).toEqual(['S', 'M', 'L'])
  })

  it('generates cross-product for two attributes', () => {
    const combos = generateCombinations([
      { name: 'Ukuran', values: 'S, M' },
      { name: 'Warna', values: 'Merah, Biru' },
    ])
    expect(combos).toHaveLength(4)
    expect(combos.map(c => c.key)).toEqual(['S-Merah', 'S-Biru', 'M-Merah', 'M-Biru'])
  })

  it('returns empty array when attributes are empty', () => {
    const combos = generateCombinations([{ name: '', values: '' }])
    expect(combos).toHaveLength(0)
  })

  it('returns empty array when values string is blank', () => {
    const combos = generateCombinations([{ name: 'Ukuran', values: '   ' }])
    expect(combos).toHaveLength(0)
  })

  it('trims whitespace from values', () => {
    const combos = generateCombinations([{ name: 'Ukuran', values: ' S ,  M ,  L ' }])
    expect(combos.map(c => c.labels[0])).toEqual(['S', 'M', 'L'])
  })

  it('default priceAdj and stock are 0', () => {
    const combos = generateCombinations([{ name: 'Ukuran', values: 'S' }])
    expect(combos[0].priceAdj).toBe(0)
    expect(combos[0].stock).toBe(0)
  })
})

// ── Price adjustment calculation ─────────────────────────────────────────────

describe('Price adjustment calculation', () => {
  it('returns base price when adjustment is 0', () => {
    expect(calcFinalPrice(50000, 0)).toBe(50000)
  })

  it('adds positive price adjustment', () => {
    expect(calcFinalPrice(50000, 10000)).toBe(60000)
  })

  it('subtracts negative price adjustment', () => {
    expect(calcFinalPrice(50000, -5000)).toBe(45000)
  })
})

// ── SKU suffix generation ─────────────────────────────────────────────────────

describe('SKU suffix generation', () => {
  it('generates uppercase hyphen-separated suffix', () => {
    expect(generateSkuSuffix(['S', 'Merah'])).toBe('S-MERAH')
  })

  it('removes spaces within a label', () => {
    expect(generateSkuSuffix(['Extra Large', 'Biru Tua'])).toBe('EXTRALARGE-BIRUTUA')
  })

  it('handles single-label suffix', () => {
    expect(generateSkuSuffix(['XL'])).toBe('XL')
  })
})

// ── Cart line format ──────────────────────────────────────────────────────────

describe('Cart line format', () => {
  it('formats product name without variant', () => {
    expect(formatCartLine('Kaos')).toBe('Kaos')
  })

  it('formats product name with one variant label', () => {
    expect(formatCartLine('Kaos', ['M'])).toBe('Kaos (M)')
  })

  it('formats product name with two variant labels', () => {
    expect(formatCartLine('Kaos', ['M', 'Merah'])).toBe('Kaos (M, Merah)')
  })

  it('formats product name with empty variants array', () => {
    expect(formatCartLine('Kaos', [])).toBe('Kaos')
  })
})
