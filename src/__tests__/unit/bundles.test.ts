import { describe, it, expect } from 'vitest'

// ── Types ────────────────────────────────────────────────────────────────────

interface Product {
  id: string
  name: string
  price: number
  cost: number
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

interface CartItem {
  id: string
  productId: string
  name: string
  price: number
  qty: number
  subtotal: number
  bundleId?: string
}

// ── Business Logic Helpers ───────────────────────────────────────────────────

/** Sum of (component.price × qty) for all bundle items */
function bundleComponentTotal(bundle: Bundle): number {
  return bundle.items.reduce((sum, item) => sum + item.product.price * item.qty, 0)
}

/** Bundle discount = component total − bundle price (0 if bundle costs more) */
function bundleDiscount(bundle: Bundle): number {
  return Math.max(0, bundleComponentTotal(bundle) - bundle.price)
}

/** Discount as a percentage of component total (0–100) */
function bundleDiscountPercent(bundle: Bundle): number {
  const total = bundleComponentTotal(bundle)
  if (total === 0) return 0
  return Math.round((bundleDiscount(bundle) / total) * 100)
}

/** Expand a bundle into CartItems (one per component product × qty) */
function expandBundleToCartItems(bundle: Bundle): CartItem[] {
  return bundle.items.map(item => ({
    id: `${bundle.id}-${item.productId}-${Date.now()}`,
    productId: item.productId,
    name: item.product.name,
    price: item.product.price,
    qty: item.qty,
    subtotal: item.product.price * item.qty,
    bundleId: bundle.id,
  }))
}

/** Add bundle components to cart; merge with existing items if already present */
function addBundleToCart(cart: CartItem[], bundle: Bundle): CartItem[] {
  const newItems = expandBundleToCartItems(bundle)
  let updated = [...cart]
  for (const newItem of newItems) {
    const existing = updated.find(i => i.productId === newItem.productId)
    if (existing) {
      updated = updated.map(i =>
        i.productId === newItem.productId
          ? { ...i, qty: i.qty + newItem.qty, subtotal: (i.qty + newItem.qty) * i.price }
          : i,
      )
    } else {
      updated.push(newItem)
    }
  }
  return updated
}

/** Returns true when every tracked component has enough stock for its qty */
function isBundleAvailable(bundle: Bundle): boolean {
  return bundle.items.every(item => {
    if (!item.product.trackStock) return true
    return item.product.stock >= item.qty
  })
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

const coffee: Product = {
  id: 'p1',
  name: 'Kopi Hitam',
  price: 15000,
  cost: 5000,
  stock: 20,
  trackStock: true,
}
const cake: Product = {
  id: 'p2',
  name: 'Kue Coklat',
  price: 25000,
  cost: 8000,
  stock: 10,
  trackStock: true,
}
const water: Product = {
  id: 'p3',
  name: 'Air Mineral',
  price: 5000,
  cost: 1000,
  stock: 0,
  trackStock: true,
}
const service: Product = {
  id: 'p4',
  name: 'Gift Wrap',
  price: 2000,
  cost: 500,
  stock: 0,
  trackStock: false,
}

const cafeBundle: Bundle = {
  id: 'b1',
  name: 'Cafe Set',
  price: 35000,
  active: true,
  items: [
    { productId: 'p1', qty: 1, product: coffee },
    { productId: 'p2', qty: 1, product: cake },
  ],
}

const premiumBundle: Bundle = {
  id: 'b2',
  name: 'Premium Set',
  price: 50000,
  active: true,
  items: [
    { productId: 'p1', qty: 2, product: coffee },
    { productId: 'p2', qty: 1, product: cake },
  ],
}

const outOfStockBundle: Bundle = {
  id: 'b3',
  name: 'Sold Out Set',
  price: 18000,
  active: true,
  items: [
    { productId: 'p1', qty: 1, product: coffee },
    { productId: 'p3', qty: 1, product: water },
  ],
}

const serviceBundle: Bundle = {
  id: 'b4',
  name: 'Gift Set',
  price: 30000,
  active: true,
  items: [
    { productId: 'p1', qty: 1, product: coffee },
    { productId: 'p4', qty: 1, product: service }, // untracked stock
  ],
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Bundle price vs sum of components', () => {
  it('correctly sums component prices for cafeBundle', () => {
    expect(bundleComponentTotal(cafeBundle)).toBe(40000) // 15000 + 25000
  })

  it('correctly sums component prices for premiumBundle (multi-qty)', () => {
    expect(bundleComponentTotal(premiumBundle)).toBe(55000) // 2×15000 + 25000
  })

  it('bundle price is lower than component total (discount exists)', () => {
    expect(cafeBundle.price).toBeLessThan(bundleComponentTotal(cafeBundle))
  })

  it('bundleDiscount returns correct savings amount', () => {
    expect(bundleDiscount(cafeBundle)).toBe(5000) // 40000 − 35000
  })

  it('bundleDiscountPercent rounds to nearest integer', () => {
    expect(bundleDiscountPercent(cafeBundle)).toBe(13) // 5000/40000 ≈ 12.5 → 13
  })

  it('bundleDiscount never returns negative even if bundle costs more', () => {
    const expensiveBundle: Bundle = { ...cafeBundle, price: 99000 }
    expect(bundleDiscount(expensiveBundle)).toBe(0)
  })
})

describe('Bundle expansion to cart items', () => {
  it('expands bundle to one CartItem per component', () => {
    const items = expandBundleToCartItems(cafeBundle)
    expect(items).toHaveLength(2)
  })

  it('each CartItem carries the correct productId', () => {
    const items = expandBundleToCartItems(cafeBundle)
    const ids = items.map(i => i.productId)
    expect(ids).toContain('p1')
    expect(ids).toContain('p2')
  })

  it('CartItem qty matches BundleItem qty', () => {
    const items = expandBundleToCartItems(premiumBundle)
    const coffeeItem = items.find(i => i.productId === 'p1')!
    expect(coffeeItem.qty).toBe(2)
    expect(coffeeItem.subtotal).toBe(30000) // 2 × 15000
  })

  it('all CartItems carry the bundleId for reference', () => {
    const items = expandBundleToCartItems(cafeBundle)
    expect(items.every(i => i.bundleId === 'b1')).toBe(true)
  })
})

describe('Bundle availability check', () => {
  it('returns true when all components are in stock', () => {
    expect(isBundleAvailable(cafeBundle)).toBe(true)
  })

  it('returns false when any tracked component is out of stock', () => {
    expect(isBundleAvailable(outOfStockBundle)).toBe(false)
  })

  it('ignores stock on untracked products (trackStock=false)', () => {
    // service product has stock=0 but trackStock=false — bundle should be available
    expect(isBundleAvailable(serviceBundle)).toBe(true)
  })
})

describe('Bundle discount calculation', () => {
  it('addBundleToCart adds components to empty cart', () => {
    const cart = addBundleToCart([], cafeBundle)
    expect(cart).toHaveLength(2)
  })

  it('addBundleToCart merges with existing cart item for same product', () => {
    const existing: CartItem[] = [
      {
        id: 'existing-p1',
        productId: 'p1',
        name: 'Kopi Hitam',
        price: 15000,
        qty: 1,
        subtotal: 15000,
      },
    ]
    const cart = addBundleToCart(existing, cafeBundle)
    const coffeeInCart = cart.find(i => i.productId === 'p1')!
    // original 1 + bundle 1 = 2
    expect(coffeeInCart.qty).toBe(2)
    expect(coffeeInCart.subtotal).toBe(30000)
    // cake is new
    expect(cart).toHaveLength(2)
  })

  it('adding two different bundles accumulates all components', () => {
    const cart1 = addBundleToCart([], cafeBundle) // coffee×1, cake×1
    const cart2 = addBundleToCart(cart1, premiumBundle) // coffee×2, cake×1
    const coffeeInCart = cart2.find(i => i.productId === 'p1')!
    expect(coffeeInCart.qty).toBe(3) // 1 + 2
    expect(cart2).toHaveLength(2) // coffee + cake only
  })
})

// ── Edge cases ────────────────────────────────────────────────────────────────

describe('Bundle edge cases', () => {
  it('bundle with zero price has max discount', () => {
    const freeBundle: Bundle = { ...cafeBundle, price: 0 }
    expect(bundleDiscount(freeBundle)).toBe(bundleComponentTotal(cafeBundle))
  })

  it('bundle with one item expands to one CartItem', () => {
    const singleItemBundle: Bundle = {
      id: 'b5',
      name: 'Solo',
      price: 10000,
      active: true,
      items: [{ productId: 'p1', qty: 1, product: coffee }],
    }
    expect(expandBundleToCartItems(singleItemBundle)).toHaveLength(1)
  })

  it('bundle with qty > 1 for a single component has correct subtotal', () => {
    const multiQtyBundle: Bundle = {
      id: 'b6',
      name: 'Triple Coffee',
      price: 40000,
      active: true,
      items: [{ productId: 'p1', qty: 3, product: coffee }],
    }
    const items = expandBundleToCartItems(multiQtyBundle)
    expect(items[0].qty).toBe(3)
    expect(items[0].subtotal).toBe(45000) // 3 × 15000
  })

  it('bundleDiscountPercent is 0 when bundle price equals component total', () => {
    const noDiscountBundle: Bundle = { ...cafeBundle, price: 40000 }
    expect(bundleDiscountPercent(noDiscountBundle)).toBe(0)
  })

  it('bundleDiscountPercent is 0 for zero-component-total bundle', () => {
    const zeroCostBundle: Bundle = {
      id: 'bz',
      name: 'Zero',
      price: 0,
      active: true,
      items: [{ productId: 'p1', qty: 1, product: { ...coffee, price: 0 } }],
    }
    expect(bundleDiscountPercent(zeroCostBundle)).toBe(0)
  })

  it('addBundleToCart to empty cart returns exactly bundle item count', () => {
    const cart = addBundleToCart([], premiumBundle)
    expect(cart).toHaveLength(2) // coffee + cake
  })

  it('bundle availability: partial stock shortage makes bundle unavailable', () => {
    const lowStockCoffee: Product = { ...coffee, stock: 0 }
    const lowBundle: Bundle = {
      id: 'blow',
      name: 'Low',
      price: 30000,
      active: true,
      items: [{ productId: 'p1', qty: 1, product: lowStockCoffee }],
    }
    expect(isBundleAvailable(lowBundle)).toBe(false)
  })

  it('bundle with mixed tracked/untracked is available if tracked items have stock', () => {
    // coffee has stock=20 (tracked), service has stock=0 (untracked) — should be available
    expect(isBundleAvailable(serviceBundle)).toBe(true)
  })

  it('expandBundleToCartItems ids are unique (different timestamps are fine)', () => {
    const items = expandBundleToCartItems(cafeBundle)
    const ids = items.map(i => i.id)
    // Each id includes productId so they are distinct
    expect(ids[0]).not.toBe(ids[1])
  })

  it('bundleComponentTotal for empty items list is 0', () => {
    const emptyBundle: Bundle = { id: 'be', name: 'Empty', price: 0, active: true, items: [] }
    expect(bundleComponentTotal(emptyBundle)).toBe(0)
  })
})
