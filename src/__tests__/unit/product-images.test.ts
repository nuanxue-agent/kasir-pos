import { describe, it, expect } from 'vitest'

// ─── Helpers (mirrors ProductFormModal validation logic) ──────────────────────

function isValidImageUrl(url: string | null | undefined): boolean {
  if (!url || url.trim() === '') return true // empty is valid (optional field)
  return /^https?:\/\//i.test(url)
}

function getImageOrFallback(
  image: string | null | undefined,
  fallbackIcon: string | null | undefined,
): { type: 'image'; src: string } | { type: 'fallback'; icon: string } {
  if (image && image.trim() !== '') {
    return { type: 'image', src: image }
  }
  return { type: 'fallback', icon: fallbackIcon || '📦' }
}

// ─── Product schema shape ──────────────────────────────────────────────────────

interface Product {
  id: string
  name: string
  price: number
  stock: number
  trackStock: boolean
  sku?: string | null
  barcode?: string | null
  image?: string | null
  category?: { id: string; name: string; color?: string | null; icon?: string | null } | null
  variants: Array<{ id: string; name: string; price?: number | null; stock: number }>
}

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'prod-1',
    name: 'Test Product',
    price: 10000,
    stock: 10,
    trackStock: true,
    variants: [],
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('product image URL validation', () => {
  it('accepts empty string as valid (field is optional)', () => {
    expect(isValidImageUrl('')).toBe(true)
  })

  it('accepts null as valid (field is optional)', () => {
    expect(isValidImageUrl(null)).toBe(true)
  })

  it('accepts undefined as valid (field is optional)', () => {
    expect(isValidImageUrl(undefined)).toBe(true)
  })

  it('accepts https:// URL', () => {
    expect(isValidImageUrl('https://example.com/image.jpg')).toBe(true)
  })

  it('accepts http:// URL', () => {
    expect(isValidImageUrl('http://cdn.example.com/img.png')).toBe(true)
  })

  it('rejects non-http URL (e.g. ftp://)', () => {
    expect(isValidImageUrl('ftp://example.com/image.jpg')).toBe(false)
  })

  it('rejects plain string without protocol', () => {
    expect(isValidImageUrl('example.com/image.jpg')).toBe(false)
  })

  it('rejects javascript: protocol', () => {
    expect(isValidImageUrl('javascript:alert(1)')).toBe(false)
  })
})

describe('product image field in schema', () => {
  it('product interface accepts image field', () => {
    const p = makeProduct({ image: 'https://example.com/img.jpg' })
    expect(p.image).toBe('https://example.com/img.jpg')
  })

  it('product interface accepts null image', () => {
    const p = makeProduct({ image: null })
    expect(p.image).toBeNull()
  })

  it('product interface accepts undefined image', () => {
    const p = makeProduct()
    expect(p.image).toBeUndefined()
  })
})

describe('POS card image/fallback logic', () => {
  it('returns image type when product has image URL', () => {
    const p = makeProduct({ image: 'https://example.com/img.jpg', category: null })
    const result = getImageOrFallback(p.image, p.category?.icon)
    expect(result.type).toBe('image')
    if (result.type === 'image') {
      expect(result.src).toBe('https://example.com/img.jpg')
    }
  })

  it('returns fallback type when product has no image', () => {
    const p = makeProduct({ image: null, category: { id: 'c1', name: 'Drinks', icon: '🥤' } })
    const result = getImageOrFallback(p.image, p.category?.icon)
    expect(result.type).toBe('fallback')
    if (result.type === 'fallback') {
      expect(result.icon).toBe('🥤')
    }
  })

  it('uses default 📦 icon when no image and no category icon', () => {
    const p = makeProduct({ image: null, category: null })
    const result = getImageOrFallback(p.image, p.category?.icon)
    expect(result.type).toBe('fallback')
    if (result.type === 'fallback') {
      expect(result.icon).toBe('📦')
    }
  })

  it('empty string image falls back to icon', () => {
    const p = makeProduct({ image: '', category: { id: 'c1', name: 'Food', icon: '🍔' } })
    const result = getImageOrFallback(p.image, p.category?.icon)
    expect(result.type).toBe('fallback')
  })
})
