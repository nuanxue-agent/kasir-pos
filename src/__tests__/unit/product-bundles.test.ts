import { describe, it, expect } from 'vitest'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Product {
  id: string
  name: string
  price: number
  stock: number
  trackStock: boolean
}

interface BundleItem {
  productId: string
  qty: number
  product: Product
}

interface Bundle {
  id: string
  name: string
  price: number
  active: boolean
  items: BundleItem[]
}

// ── Business Logic ────────────────────────────────────────────────────────────

/** Total retail value of all components (sum of price × qty) */
function bundleComponentTotal(bundle: Bundle): number {
  return bundle.items.reduce((sum, item) => sum + item.product.price * item.qty, 0)
}

/** Savings: component total minus bundle price (never negative) */
function bundleDiscount(bundle: Bundle): number {
  return Math.max(0, bundleComponentTotal(bundle) - bundle.price)
}

/** Discount as a percentage of component total (0–100, rounded) */
function bundleDiscountPercent(bundle: Bundle): number {
  const total = bundleComponentTotal(bundle)
  if (total === 0) return 0
  return Math.round((bundleDiscount(bundle) / total) * 100)
}

/** Check whether all tracked components have enough stock */
function isBundleAvailable(bundle: Bundle): boolean {
  return bundle.items.every(
    item => !item.product.trackStock || item.product.stock >= item.qty,
  )
}

/** Deduct component stock after adding bundle to cart — returns updated products map */
function deductBundleStock(
  bundle: Bundle,
  stockMap: Record<string, number>,
): Record<string, number> {
  const updated = { ...stockMap }
  for (const item of bundle.items) {
    if (item.product.trackStock) {
      updated[item.productId] = (updated[item.productId] ?? item.product.stock) - item.qty
    }
  }
  return updated
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const coffee: Product = { id: 'p1', name: 'Kopi', price: 15_000, stock: 10, trackStock: true }
const milk: Product = { id: 'p2', name: 'Susu', price: 8_000, stock: 5, trackStock: true }
const sugar: Product = { id: 'p3', name: 'Gula', price: 3_000, stock: 20, trackStock: true }
const noTrack: Product = { id: 'p4', name: 'Sticker', price: 500, stock: 0, trackStock: false }

const breakfastBundle: Bundle = {
  id: 'b1',
  name: 'Paket Sarapan',
  price: 22_000,
  active: true,
  items: [
    { productId: 'p1', qty: 1, product: coffee },
    { productId: 'p2', qty: 1, product: milk },
  ],
}

// Component total = 15000 + 8000 = 23000, bundle price = 22000 → discount = 1000 (≈4%)

const freeBundle: Bundle = {
  id: 'b2',
  name: 'Paket Promosi',
  price: 0,
  active: true,
  items: [{ productId: 'p3', qty: 2, product: sugar }],
}

// Component total = 3000 × 2 = 6000, bundle price = 0 → 100% discount

const multiQtyBundle: Bundle = {
  id: 'b3',
  name: 'Paket Keluarga',
  price: 40_000,
  active: true,
  items: [
    { productId: 'p1', qty: 2, product: coffee },
    { productId: 'p2', qty: 3, product: milk },
  ],
}

// Component total = 15000×2 + 8000×3 = 30000 + 24000 = 54000

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('product-bundles: price calculation', () => {
  it('bundleComponentTotal sums price × qty for each item', () => {
    expect(bundleComponentTotal(breakfastBundle)).toBe(23_000)
  })

  it('bundleComponentTotal handles multi-qty items correctly', () => {
    expect(bundleComponentTotal(multiQtyBundle)).toBe(54_000)
  })

  it('bundle price can be lower than component total', () => {
    expect(breakfastBundle.price).toBeLessThan(bundleComponentTotal(breakfastBundle))
  })
})

describe('product-bundles: discount calculation', () => {
  it('bundleDiscount returns savings (component total − bundle price)', () => {
    expect(bundleDiscount(breakfastBundle)).toBe(1_000)
  })

  it('bundleDiscount returns 0 when bundle price equals component total', () => {
    const parity: Bundle = { ...breakfastBundle, price: 23_000 }
    expect(bundleDiscount(parity)).toBe(0)
  })

  it('bundleDiscount never goes negative when bundle costs more than components', () => {
    const overpriced: Bundle = { ...breakfastBundle, price: 99_000 }
    expect(bundleDiscount(overpriced)).toBe(0)
  })

  it('bundleDiscountPercent calculates correct percentage (rounded)', () => {
    // 1000 / 23000 ≈ 4.35% → rounds to 4
    expect(bundleDiscountPercent(breakfastBundle)).toBe(4)
  })

  it('bundleDiscountPercent is 100 for a free bundle', () => {
    expect(bundleDiscountPercent(freeBundle)).toBe(100)
  })
})

describe('product-bundles: availability check', () => {
  it('returns true when all tracked components have sufficient stock', () => {
    expect(isBundleAvailable(breakfastBundle)).toBe(true)
  })

  it('returns false when a tracked component is out of stock', () => {
    const outOfStock: Bundle = {
      ...breakfastBundle,
      items: [
        { productId: 'p1', qty: 1, product: { ...coffee, stock: 0 } },
        { productId: 'p2', qty: 1, product: milk },
      ],
    }
    expect(isBundleAvailable(outOfStock)).toBe(false)
  })

  it('returns false when required qty exceeds available stock', () => {
    const insufficient: Bundle = {
      ...multiQtyBundle,
      items: [
        { productId: 'p1', qty: 20, product: coffee }, // stock is 10
        { productId: 'p2', qty: 1, product: milk },
      ],
    }
    expect(isBundleAvailable(insufficient)).toBe(false)
  })

  it('ignores stock for untracked (trackStock=false) components', () => {
    const withNoTrack: Bundle = {
      id: 'b4',
      name: 'Paket Sticker',
      price: 500,
      active: true,
      items: [{ productId: 'p4', qty: 100, product: noTrack }], // stock=0 but untracked
    }
    expect(isBundleAvailable(withNoTrack)).toBe(true)
  })
})

describe('product-bundles: stock deduction', () => {
  it('deductBundleStock reduces stock for each tracked component', () => {
    const stockMap = { p1: 10, p2: 5 }
    const updated = deductBundleStock(breakfastBundle, stockMap)
    expect(updated.p1).toBe(9)
    expect(updated.p2).toBe(4)
  })

  it('deductBundleStock deducts correct amount for multi-qty items', () => {
    const stockMap = { p1: 10, p2: 5 }
    const updated = deductBundleStock(multiQtyBundle, stockMap)
    expect(updated.p1).toBe(8) // 10 - 2
    expect(updated.p2).toBe(2) // 5 - 3
  })

  it('deductBundleStock does not deduct untracked component stock', () => {
    const withNoTrack: Bundle = {
      id: 'b5',
      name: 'Paket Mix',
      price: 1_000,
      active: true,
      items: [
        { productId: 'p1', qty: 1, product: coffee },
        { productId: 'p4', qty: 5, product: noTrack },
      ],
    }
    const stockMap = { p1: 10, p4: 0 }
    const updated = deductBundleStock(withNoTrack, stockMap)
    expect(updated.p1).toBe(9)
    expect(updated.p4).toBe(0) // unchanged because trackStock=false
  })
})
