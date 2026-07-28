import { describe, it, expect } from 'vitest'
import {
  aggregateRatings,
  filterBySource,
  selectFeatured,
  generateEmbedCode,
  generateScriptTag,
  isValidStatusTransition,
} from '@/lib/testimonials'
import type { Testimonial, TestimonialSource, TestimonialStatus } from '@/lib/testimonials'

const makeTestimonial = (overrides: Partial<Testimonial> = {}): Testimonial => ({
  id: 'test-1',
  storeId: 'store-1',
  customerName: 'Budi Santoso',
  content: 'Produk sangat bagus!',
  rating: 5,
  source: 'IN_APP',
  status: 'APPROVED',
  createdAt: '2026-01-15T10:00:00.000Z',
  ...overrides,
})

// ─── Rating Aggregation ─────────────────────────────────────────────────────

describe('aggregateRatings', () => {
  it('computes correct average from mixed ratings', () => {
    const testimonials = [
      makeTestimonial({ rating: 5 }),
      makeTestimonial({ rating: 4 }),
      makeTestimonial({ rating: 3 }),
    ]
    const result = aggregateRatings(testimonials)
    expect(result.average).toBe(4)
    expect(result.count).toBe(3)
  })

  it('returns zero average for empty array', () => {
    const result = aggregateRatings([])
    expect(result.average).toBe(0)
    expect(result.count).toBe(0)
  })

  it('builds correct rating distribution', () => {
    const testimonials = [
      makeTestimonial({ rating: 5 }),
      makeTestimonial({ rating: 5 }),
      makeTestimonial({ rating: 4 }),
      makeTestimonial({ rating: 1 }),
    ]
    const result = aggregateRatings(testimonials)
    expect(result.distribution[5]).toBe(2)
    expect(result.distribution[4]).toBe(1)
    expect(result.distribution[1]).toBe(1)
    expect(result.distribution[2]).toBe(0)
    expect(result.distribution[3]).toBe(0)
  })
})

// ─── Source Filtering ────────────────────────────────────────────────────────

describe('filterBySource', () => {
  const testimonials: Testimonial[] = [
    makeTestimonial({ id: '1', source: 'GOOGLE' }),
    makeTestimonial({ id: '2', source: 'TOKOPEDIA' }),
    makeTestimonial({ id: '3', source: 'IN_APP' }),
    makeTestimonial({ id: '4', source: 'GOOGLE' }),
  ]

  it('filters to specific source', () => {
    const result = filterBySource(testimonials, 'GOOGLE')
    expect(result).toHaveLength(2)
    expect(result.every(t => t.source === 'GOOGLE')).toBe(true)
  })

  it('returns all testimonials when source is ALL', () => {
    const result = filterBySource(testimonials, 'ALL')
    expect(result).toHaveLength(4)
  })

  it('returns empty array when no testimonials match source', () => {
    const result = filterBySource(testimonials, 'SHOPEE')
    expect(result).toHaveLength(0)
  })
})

// ─── Featured Selection ───────────────────────────────────────────────────────

describe('selectFeatured', () => {
  it('selects only FEATURED and APPROVED testimonials', () => {
    const testimonials: Testimonial[] = [
      makeTestimonial({ id: '1', status: 'FEATURED', rating: 5 }),
      makeTestimonial({ id: '2', status: 'APPROVED', rating: 4 }),
      makeTestimonial({ id: '3', status: 'PENDING', rating: 5 }),
      makeTestimonial({ id: '4', status: 'REJECTED', rating: 5 }),
    ]
    const result = selectFeatured(testimonials)
    expect(result).toHaveLength(2)
    expect(result.map(t => t.id)).toEqual(expect.arrayContaining(['1', '2']))
  })

  it('sorts by rating descending', () => {
    const testimonials: Testimonial[] = [
      makeTestimonial({ id: '1', status: 'APPROVED', rating: 3 }),
      makeTestimonial({ id: '2', status: 'APPROVED', rating: 5 }),
      makeTestimonial({ id: '3', status: 'APPROVED', rating: 4 }),
    ]
    const result = selectFeatured(testimonials)
    expect(result[0].id).toBe('2')
    expect(result[1].id).toBe('3')
    expect(result[2].id).toBe('1')
  })

  it('respects maxCount limit', () => {
    const testimonials = Array.from({ length: 10 }, (_, i) =>
      makeTestimonial({ id: String(i), status: 'APPROVED', rating: 5 }),
    )
    const result = selectFeatured(testimonials, 3)
    expect(result).toHaveLength(3)
  })

  it('breaks ties by recency (newest first)', () => {
    const testimonials: Testimonial[] = [
      makeTestimonial({ id: 'older', status: 'APPROVED', rating: 5, createdAt: '2026-01-01T00:00:00.000Z' }),
      makeTestimonial({ id: 'newer', status: 'APPROVED', rating: 5, createdAt: '2026-06-01T00:00:00.000Z' }),
    ]
    const result = selectFeatured(testimonials)
    expect(result[0].id).toBe('newer')
  })
})

// ─── Embed Code Generation ────────────────────────────────────────────────────

describe('generateEmbedCode', () => {
  it('includes storeId in embed code', () => {
    const code = generateEmbedCode('https://app.kasir.id', { storeId: 'store-abc' })
    expect(code).toContain('store-abc')
  })

  it('includes the base URL in embed code', () => {
    const code = generateEmbedCode('https://app.kasir.id', { storeId: 'store-abc' })
    expect(code).toContain('https://app.kasir.id')
  })

  it('generateScriptTag produces valid script element', () => {
    const tag = generateScriptTag('https://app.kasir.id', 'store-xyz')
    expect(tag).toContain('<script>')
    expect(tag).toContain('store-xyz')
    expect(tag).toContain('</script>')
  })
})

// ─── Status Transitions ───────────────────────────────────────────────────────

describe('isValidStatusTransition', () => {
  it('allows PENDING → APPROVED', () => {
    expect(isValidStatusTransition('PENDING', 'APPROVED')).toBe(true)
  })

  it('allows PENDING → REJECTED', () => {
    expect(isValidStatusTransition('PENDING', 'REJECTED')).toBe(true)
  })

  it('allows APPROVED → FEATURED', () => {
    expect(isValidStatusTransition('APPROVED', 'FEATURED')).toBe(true)
  })

  it('allows FEATURED → APPROVED (unfeature)', () => {
    expect(isValidStatusTransition('FEATURED', 'APPROVED')).toBe(true)
  })

  it('allows REJECTED → PENDING (restore)', () => {
    expect(isValidStatusTransition('REJECTED', 'PENDING')).toBe(true)
  })

  it('disallows PENDING → FEATURED (must be approved first)', () => {
    expect(isValidStatusTransition('PENDING', 'FEATURED')).toBe(false)
  })

  it('disallows REJECTED → FEATURED', () => {
    expect(isValidStatusTransition('REJECTED', 'FEATURED')).toBe(false)
  })
})
