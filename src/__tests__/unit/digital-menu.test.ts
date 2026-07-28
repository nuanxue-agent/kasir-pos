import { describe, it, expect } from 'vitest'

// ─── Types (mirror what the API/component uses) ────────────────────────────

interface MenuCategory {
  id: string
  storeId: string
  name: string
  displayOrder: number
  imageUrl: string | null
  active: boolean
}

interface MenuItem {
  id: string
  categoryId: string
  productId: string
  storeId: string
  displayOrder: number
  featured: boolean
  available: boolean
  productPrice?: number
}

interface KioskOrderItem {
  productId: string
  name: string
  price: number
  qty: number
}

type KioskOrderStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED'

// ─── Pure business-logic helpers (mirror what the API route does) ──────────

function sortByDisplayOrder<T extends { displayOrder: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.displayOrder - b.displayOrder)
}

function getFeaturedItems(items: MenuItem[]): MenuItem[] {
  return items.filter(i => i.featured && i.available)
}

function getAvailableItems(items: MenuItem[], categoryId?: string): MenuItem[] {
  const filtered = items.filter(i => i.available)
  return categoryId ? filtered.filter(i => i.categoryId === categoryId) : filtered
}

function calcKioskTotal(items: KioskOrderItem[]): number {
  return items.reduce((sum, i) => sum + i.price * i.qty, 0)
}

function isValidKioskOrderStatus(current: KioskOrderStatus, next: KioskOrderStatus): boolean {
  const allowed: Record<KioskOrderStatus, KioskOrderStatus[]> = {
    PENDING:   ['CONFIRMED', 'CANCELLED'],
    CONFIRMED: ['CANCELLED'],
    CANCELLED: [],
  }
  return allowed[current].includes(next)
}

function validateKioskItems(items: KioskOrderItem[]): { valid: boolean; error?: string } {
  if (!Array.isArray(items) || items.length === 0) {
    return { valid: false, error: 'items must be a non-empty array' }
  }
  for (const item of items) {
    if (!item.productId || typeof item.productId !== 'string') {
      return { valid: false, error: 'each item must have a productId' }
    }
    if (typeof item.price !== 'number' || item.price <= 0) {
      return { valid: false, error: `item price must be positive, got ${item.price}` }
    }
    if (typeof item.qty !== 'number' || item.qty <= 0 || !Number.isInteger(item.qty)) {
      return { valid: false, error: `item qty must be a positive integer, got ${item.qty}` }
    }
  }
  return { valid: true }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function makeCategory(overrides: Partial<MenuCategory> & { id: string }): MenuCategory {
  return {
    storeId: 'store-1',
    name: 'Makanan',
    displayOrder: 0,
    imageUrl: null,
    active: true,
    ...overrides,
  }
}

function makeItem(overrides: Partial<MenuItem> & { id: string; categoryId: string }): MenuItem {
  return {
    productId: `prod-${overrides.id}`,
    storeId: 'store-1',
    displayOrder: 0,
    featured: false,
    available: true,
    productPrice: 15000,
    ...overrides,
  }
}

// ─── 1. Menu category ordering ────────────────────────────────────────────

describe('sortByDisplayOrder — menu categories', () => {
  it('returns categories in ascending displayOrder', () => {
    const cats = [
      makeCategory({ id: 'c3', displayOrder: 2, name: 'Dessert' }),
      makeCategory({ id: 'c1', displayOrder: 0, name: 'Makanan' }),
      makeCategory({ id: 'c2', displayOrder: 1, name: 'Minuman' }),
    ]
    const sorted = sortByDisplayOrder(cats)
    expect(sorted.map(c => c.name)).toEqual(['Makanan', 'Minuman', 'Dessert'])
  })

  it('handles equal displayOrder without crashing', () => {
    const cats = [
      makeCategory({ id: 'c1', displayOrder: 0 }),
      makeCategory({ id: 'c2', displayOrder: 0 }),
    ]
    expect(sortByDisplayOrder(cats)).toHaveLength(2)
  })

  it('does not mutate the original array', () => {
    const cats = [
      makeCategory({ id: 'c2', displayOrder: 1 }),
      makeCategory({ id: 'c1', displayOrder: 0 }),
    ]
    const original = cats.map(c => c.id)
    sortByDisplayOrder(cats)
    expect(cats.map(c => c.id)).toEqual(original)
  })
})

// ─── 2. Featured item logic ───────────────────────────────────────────────

describe('getFeaturedItems', () => {
  it('returns only featured AND available items', () => {
    const items = [
      makeItem({ id: 'i1', categoryId: 'c1', featured: true, available: true }),
      makeItem({ id: 'i2', categoryId: 'c1', featured: false, available: true }),
      makeItem({ id: 'i3', categoryId: 'c1', featured: true, available: false }),
    ]
    const result = getFeaturedItems(items)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('i1')
  })

  it('returns empty array when no featured items exist', () => {
    const items = [makeItem({ id: 'i1', categoryId: 'c1', featured: false })]
    expect(getFeaturedItems(items)).toEqual([])
  })
})

// ─── 3. Kiosk order total calculation ────────────────────────────────────

describe('calcKioskTotal', () => {
  it('calculates total correctly for multiple items', () => {
    const items: KioskOrderItem[] = [
      { productId: 'p1', name: 'Nasi Goreng', price: 25000, qty: 2 },
      { productId: 'p2', name: 'Es Teh', price: 5000, qty: 3 },
    ]
    expect(calcKioskTotal(items)).toBe(65000)
  })

  it('returns 0 for empty cart', () => {
    expect(calcKioskTotal([])).toBe(0)
  })

  it('handles single item correctly', () => {
    const items: KioskOrderItem[] = [{ productId: 'p1', name: 'Kopi', price: 18000, qty: 1 }]
    expect(calcKioskTotal(items)).toBe(18000)
  })
})

// ─── 4. Availability check ────────────────────────────────────────────────

describe('getAvailableItems', () => {
  const items = [
    makeItem({ id: 'i1', categoryId: 'c1', available: true }),
    makeItem({ id: 'i2', categoryId: 'c1', available: false }),
    makeItem({ id: 'i3', categoryId: 'c2', available: true }),
  ]

  it('filters out unavailable items', () => {
    const result = getAvailableItems(items)
    expect(result.every(i => i.available)).toBe(true)
    expect(result).toHaveLength(2)
  })

  it('filters by category when categoryId provided', () => {
    const result = getAvailableItems(items, 'c1')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('i1')
  })

  it('returns empty when all items in category are unavailable', () => {
    const result = getAvailableItems(items, 'c2')
    // i3 is available and in c2
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('i3')
  })
})

// ─── 5. Kiosk order status transitions ───────────────────────────────────

describe('isValidKioskOrderStatus', () => {
  it('allows PENDING → CONFIRMED', () => {
    expect(isValidKioskOrderStatus('PENDING', 'CONFIRMED')).toBe(true)
  })

  it('allows PENDING → CANCELLED', () => {
    expect(isValidKioskOrderStatus('PENDING', 'CANCELLED')).toBe(true)
  })

  it('allows CONFIRMED → CANCELLED', () => {
    expect(isValidKioskOrderStatus('CONFIRMED', 'CANCELLED')).toBe(true)
  })

  it('rejects CANCELLED → CONFIRMED', () => {
    expect(isValidKioskOrderStatus('CANCELLED', 'CONFIRMED')).toBe(false)
  })

  it('rejects CONFIRMED → PENDING (backwards)', () => {
    expect(isValidKioskOrderStatus('CONFIRMED', 'PENDING')).toBe(false)
  })

  it('validateKioskItems rejects empty array', () => {
    const result = validateKioskItems([])
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/non-empty/)
  })

  it('validateKioskItems rejects item with zero price', () => {
    const result = validateKioskItems([{ productId: 'p1', name: 'X', price: 0, qty: 1 }])
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/price must be positive/)
  })

  it('validateKioskItems accepts valid items', () => {
    const result = validateKioskItems([
      { productId: 'p1', name: 'Nasi', price: 20000, qty: 2 },
      { productId: 'p2', name: 'Air', price: 5000, qty: 1 },
    ])
    expect(result.valid).toBe(true)
  })
})
