import { describe, it, expect } from 'vitest'

// ── Business logic: cart calculations ───────────────────────────────────────

interface CartItem {
  id: string
  productId: string
  name: string
  price: number
  qty: number
  subtotal: number
}

function calcSubtotal(items: CartItem[]): number {
  return items.reduce((sum, i) => sum + i.subtotal, 0)
}

function calcTax(subtotal: number, taxRate: number): number {
  return Math.round(subtotal * taxRate)
}

function calcTotal(subtotal: number, taxAmt: number, discount: number): number {
  return Math.max(0, subtotal + taxAmt - discount)
}

function calcChange(paid: number, total: number): number {
  return Math.max(0, paid - total)
}

function addToCart(cart: CartItem[], product: { id: string; name: string; price: number }): CartItem[] {
  const existing = cart.find(i => i.productId === product.id)
  if (existing) {
    return cart.map(i => i.productId === product.id
      ? { ...i, qty: i.qty + 1, subtotal: (i.qty + 1) * i.price }
      : i
    )
  }
  return [...cart, {
    id: `${product.id}-${Date.now()}`,
    productId: product.id,
    name: product.name,
    price: product.price,
    qty: 1,
    subtotal: product.price,
  }]
}

function removeFromCart(cart: CartItem[], productId: string): CartItem[] {
  return cart.filter(i => i.productId !== productId)
}

function updateQty(cart: CartItem[], productId: string, qty: number): CartItem[] {
  if (qty <= 0) return removeFromCart(cart, productId)
  return cart.map(i => i.productId === productId
    ? { ...i, qty, subtotal: qty * i.price }
    : i
  )
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Cart calculations', () => {
  const item1: CartItem = { id: 'a', productId: 'p1', name: 'Nasi Goreng', price: 15000, qty: 2, subtotal: 30000 }
  const item2: CartItem = { id: 'b', productId: 'p2', name: 'Es Teh', price: 5000, qty: 1, subtotal: 5000 }

  describe('calcSubtotal', () => {
    it('sums all item subtotals', () => {
      expect(calcSubtotal([item1, item2])).toBe(35000)
    })
    it('returns 0 for empty cart', () => {
      expect(calcSubtotal([])).toBe(0)
    })
  })

  describe('calcTax', () => {
    it('calculates 10% tax correctly', () => {
      expect(calcTax(100000, 0.1)).toBe(10000)
    })
    it('returns 0 when taxRate is 0', () => {
      expect(calcTax(100000, 0)).toBe(0)
    })
    it('rounds fractional tax', () => {
      expect(calcTax(33333, 0.1)).toBe(3333)
    })
  })

  describe('calcTotal', () => {
    it('adds tax and subtracts discount', () => {
      expect(calcTotal(100000, 10000, 5000)).toBe(105000)
    })
    it('never goes below 0', () => {
      expect(calcTotal(10000, 0, 999999)).toBe(0)
    })
    it('handles no tax or discount', () => {
      expect(calcTotal(50000, 0, 0)).toBe(50000)
    })
  })

  describe('calcChange', () => {
    it('calculates correct change', () => {
      expect(calcChange(100000, 75000)).toBe(25000)
    })
    it('returns 0 when exact amount given', () => {
      expect(calcChange(50000, 50000)).toBe(0)
    })
    it('returns 0 when underpaid (no negative change)', () => {
      expect(calcChange(40000, 50000)).toBe(0)
    })
  })
})

describe('Cart operations', () => {
  const p1 = { id: 'p1', name: 'Nasi Goreng', price: 15000 }
  const p2 = { id: 'p2', name: 'Es Teh', price: 5000 }

  describe('addToCart', () => {
    it('adds new product to empty cart', () => {
      const cart = addToCart([], p1)
      expect(cart).toHaveLength(1)
      expect(cart[0].qty).toBe(1)
      expect(cart[0].subtotal).toBe(15000)
    })

    it('increments qty for existing product', () => {
      const cart1 = addToCart([], p1)
      const cart2 = addToCart(cart1, p1)
      expect(cart2).toHaveLength(1)
      expect(cart2[0].qty).toBe(2)
      expect(cart2[0].subtotal).toBe(30000)
    })

    it('adds second distinct product', () => {
      const cart = addToCart(addToCart([], p1), p2)
      expect(cart).toHaveLength(2)
    })
  })

  describe('removeFromCart', () => {
    it('removes item by productId', () => {
      const cart = addToCart(addToCart([], p1), p2)
      const updated = removeFromCart(cart, 'p1')
      expect(updated).toHaveLength(1)
      expect(updated[0].productId).toBe('p2')
    })

    it('handles removing non-existent item', () => {
      const cart = addToCart([], p1)
      expect(removeFromCart(cart, 'nonexistent')).toHaveLength(1)
    })
  })

  describe('updateQty', () => {
    it('updates quantity and subtotal', () => {
      const cart = addToCart([], p1)
      const updated = updateQty(cart, 'p1', 3)
      expect(updated[0].qty).toBe(3)
      expect(updated[0].subtotal).toBe(45000)
    })

    it('removes item when qty set to 0', () => {
      const cart = addToCart([], p1)
      expect(updateQty(cart, 'p1', 0)).toHaveLength(0)
    })

    it('removes item when qty is negative', () => {
      const cart = addToCart([], p1)
      expect(updateQty(cart, 'p1', -1)).toHaveLength(0)
    })
  })
})
