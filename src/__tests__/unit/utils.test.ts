import { describe, it, expect } from 'vitest'
import { formatCurrency, formatDate, cn } from '@/lib/utils'

describe('formatCurrency', () => {
  it('formats IDR correctly', () => {
    const result = formatCurrency(15000, 'IDR')
    expect(result).toContain('15')
    expect(result).toContain('000')
  })

  it('formats USD correctly', () => {
    const result = formatCurrency(9.99, 'USD')
    expect(result).toContain('9')
    expect(result).toContain('99')
  })

  it('handles zero', () => {
    const result = formatCurrency(0, 'IDR')
    expect(result).toContain('0')
  })

  it('handles large numbers', () => {
    const result = formatCurrency(1_500_000, 'IDR')
    expect(result).toContain('1')
    expect(result).toContain('500')
  })
})

describe('cn (classname utility)', () => {
  it('merges class names', () => {
    expect(cn('a', 'b')).toBe('a b')
  })

  it('handles conditional classes', () => {
    expect(cn('a', false && 'b', 'c')).toBe('a c')
  })

  it('deduplicates Tailwind conflicting classes', () => {
    const result = cn('p-2', 'p-4')
    expect(result).not.toContain('p-2')
    expect(result).toContain('p-4')
  })

  it('handles undefined/null values', () => {
    expect(cn('a', undefined, null, 'b')).toBe('a b')
  })
})

describe('formatDate', () => {
  it('returns a non-empty string for a valid ISO date', () => {
    const result = formatDate('2025-01-15T10:00:00.000Z')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('handles different date formats', () => {
    const result = formatDate('2025-12-31')
    expect(typeof result).toBe('string')
  })
})
