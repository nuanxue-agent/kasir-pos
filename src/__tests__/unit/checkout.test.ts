import { describe, it, expect } from 'vitest'
import { buildReceiptLines } from '@/lib/receipt'

// ─── Pure helpers (mirrors logic in POSPageClient / CheckoutModal) ─────────────

/** Round up total to the nearest multiple of `step`. */
function roundUpTo(total: number, step: number): number {
  return Math.ceil(total / step) * step
}

/** All four quick-amount presets: exact, nearest 10K, 50K, 100K. */
function quickAmounts(total: number): number[] {
  const exact = total
  const r10 = roundUpTo(total, 10_000)
  const r50 = roundUpTo(total, 50_000)
  const r100 = roundUpTo(total, 100_000)
  return [exact, r10, r50, r100].filter((v, i, a) => a.indexOf(v) === i)
}

/** Change = max(0, paid - total) */
function calcChange(paid: number, total: number): number {
  return Math.max(0, paid - total)
}

// ─── Recently-sold ordering helper (pure, mirrors API SQL sort) ──────────────

interface SoldProduct {
  id: string
  name: string
  soldQty: number
}

function sortRecentlySold(products: SoldProduct[]): SoldProduct[] {
  return [...products].sort((a, b) => b.soldQty - a.soldQty)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Quick amount — round up to nearest 10K', () => {
  it('exact multiple stays the same', () => {
    expect(roundUpTo(50_000, 10_000)).toBe(50_000)
  })

  it('rounds up correctly from an irregular total', () => {
    expect(roundUpTo(47_500, 10_000)).toBe(50_000)
  })

  it('rounds up from 1 to 10K', () => {
    expect(roundUpTo(1, 10_000)).toBe(10_000)
  })
})

describe('Quick amount — round up to nearest 50K', () => {
  it('exact multiple stays the same', () => {
    expect(roundUpTo(100_000, 50_000)).toBe(100_000)
  })

  it('rounds up correctly', () => {
    expect(roundUpTo(60_000, 50_000)).toBe(100_000)
  })
})

describe('Quick amount — round up to nearest 100K', () => {
  it('exact multiple stays the same', () => {
    expect(roundUpTo(200_000, 100_000)).toBe(200_000)
  })

  it('rounds up correctly', () => {
    expect(roundUpTo(130_000, 100_000)).toBe(200_000)
  })
})

describe('quickAmounts — preset list', () => {
  it('returns exact amount as the first preset', () => {
    const amounts = quickAmounts(47_500)
    expect(amounts[0]).toBe(47_500)
  })

  it('deduplicates when total is already a multiple of all steps', () => {
    // 100_000 is an exact multiple of 10K, 50K, and 100K → only one entry after exact
    const amounts = quickAmounts(100_000)
    expect(new Set(amounts).size).toBe(amounts.length)
    expect(amounts.length).toBe(1) // all round up to same value
  })

  it('always includes at least the exact amount', () => {
    const amounts = quickAmounts(99_999)
    expect(amounts).toContain(99_999)
  })
})

describe('Change calculation', () => {
  it('returns 0 when paid equals total', () => {
    expect(calcChange(50_000, 50_000)).toBe(0)
  })

  it('returns correct change when over-paying', () => {
    expect(calcChange(100_000, 73_500)).toBe(26_500)
  })

  it('returns 0 when under-paying (never negative)', () => {
    expect(calcChange(40_000, 50_000)).toBe(0)
  })
})

describe('Note field in order receipt', () => {
  it('note line appears in receipt lines when orderNote is set', () => {
    const lines = buildReceiptLines({
      storeName: 'Toko A',
      orderNumber: 'INV-001',
      date: '2026-07-28',
      items: [{ name: 'Kopi', qty: 1, price: 15_000, subtotal: 15_000 }],
      subtotal: 15_000,
      total: 15_000,
      currency: 'IDR',
      orderNote: 'Extra sugar please',
    })
    const noteLine = lines.find(l => l.text?.includes('Extra sugar please'))
    expect(noteLine).toBeDefined()
  })

  it('no note line when orderNote is absent', () => {
    const lines = buildReceiptLines({
      storeName: 'Toko A',
      orderNumber: 'INV-002',
      date: '2026-07-28',
      items: [{ name: 'Kopi', qty: 1, price: 15_000, subtotal: 15_000 }],
      subtotal: 15_000,
      total: 15_000,
      currency: 'IDR',
    })
    const noteLine = lines.find(l => l.text?.startsWith('Note:'))
    expect(noteLine).toBeUndefined()
  })
})

describe('Recently sold ordering', () => {
  it('sorts by soldQty descending', () => {
    const products: SoldProduct[] = [
      { id: '1', name: 'A', soldQty: 3 },
      { id: '2', name: 'B', soldQty: 10 },
      { id: '3', name: 'C', soldQty: 1 },
    ]
    const sorted = sortRecentlySold(products)
    expect(sorted[0].id).toBe('2')
    expect(sorted[1].id).toBe('1')
    expect(sorted[2].id).toBe('3')
  })

  it('does not mutate the original array', () => {
    const products: SoldProduct[] = [
      { id: '1', name: 'A', soldQty: 5 },
      { id: '2', name: 'B', soldQty: 20 },
    ]
    const original = [...products]
    sortRecentlySold(products)
    expect(products).toEqual(original)
  })
})
