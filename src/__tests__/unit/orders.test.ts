import { describe, it, expect } from 'vitest'

// ── Order business logic ───────────────────────────────────────────────────────

type OrderStatus = 'PENDING' | 'COMPLETED' | 'CANCELLED' | 'REFUNDED'
type PaymentMethod = 'CASH' | 'CARD' | 'TRANSFER' | 'QRIS' | 'WALLET'

interface OrderItem {
  productId: string
  name: string
  qty: number
  unitPrice: number
  discount: number  // per-item discount amount
}

interface Order {
  id: string
  orderNumber: string
  storeId: string
  items: OrderItem[]
  taxRate: number       // e.g. 0.11 for 11%
  discountAmount: number // order-level discount
  paymentMethod: PaymentMethod
  status: OrderStatus
  createdAt: string
  completedAt?: string
}

// ── Pure functions ──────────────────────────────────────────────────────────────

function calcItemSubtotal(item: OrderItem): number {
  return item.qty * item.unitPrice - item.discount
}

function calcOrderSubtotal(items: OrderItem[]): number {
  return items.reduce((sum, i) => sum + calcItemSubtotal(i), 0)
}

function calcOrderTax(subtotal: number, taxRate: number): number {
  return Math.round(subtotal * taxRate)
}

function calcOrderTotal(order: Pick<Order, 'items' | 'taxRate' | 'discountAmount'>): number {
  const subtotal = calcOrderSubtotal(order.items)
  const tax = calcOrderTax(subtotal, order.taxRate)
  return Math.max(0, subtotal + tax - order.discountAmount)
}

const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING:   ['COMPLETED', 'CANCELLED'],
  COMPLETED: ['REFUNDED'],
  CANCELLED: [],
  REFUNDED:  [],
}

function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return STATUS_TRANSITIONS[from].includes(to)
}

function transitionOrder(order: Order, to: OrderStatus): { ok: boolean; order?: Order; error?: string } {
  if (!canTransition(order.status, to)) {
    return { ok: false, error: `Tidak bisa mengubah status dari ${order.status} ke ${to}` }
  }
  const updated: Order = {
    ...order,
    status: to,
    completedAt: to === 'COMPLETED' ? new Date().toISOString() : order.completedAt,
  }
  return { ok: true, order: updated }
}

function isRefundEligible(order: Order, asOf: string = new Date().toISOString()): { eligible: boolean; reason?: string } {
  if (order.status !== 'COMPLETED') {
    return { eligible: false, reason: 'Hanya order berstatus COMPLETED yang dapat direfund' }
  }
  if (!order.completedAt) {
    return { eligible: false, reason: 'Tanggal selesai tidak ditemukan' }
  }
  const completed = new Date(order.completedAt)
  const now = new Date(asOf)
  const diffDays = (now.getTime() - completed.getTime()) / (1000 * 60 * 60 * 24)
  if (diffDays > 30) {
    return { eligible: false, reason: 'Batas waktu refund 30 hari telah terlewati' }
  }
  return { eligible: true }
}

const VALID_PAYMENT_METHODS: PaymentMethod[] = ['CASH', 'CARD', 'TRANSFER', 'QRIS', 'WALLET']

function validatePaymentMethod(method: string): method is PaymentMethod {
  return VALID_PAYMENT_METHODS.includes(method as PaymentMethod)
}

function generateOrderNumber(storePrefix: string, sequence: number): string {
  return `${storePrefix}-${String(sequence).padStart(6, '0')}`
}

// ── Tests ───────────────────────────────────────────────────────────────────────

const baseItems: OrderItem[] = [
  { productId: 'p1', name: 'Kopi Susu', qty: 2, unitPrice: 25_000, discount: 0 },
  { productId: 'p2', name: 'Croissant', qty: 1, unitPrice: 30_000, discount: 5_000 },
]

const baseOrder: Order = {
  id: 'ord-1',
  orderNumber: 'STR-000001',
  storeId: 'store-1',
  items: baseItems,
  taxRate: 0.11,
  discountAmount: 0,
  paymentMethod: 'CASH',
  status: 'COMPLETED',
  createdAt: '2025-06-01T10:00:00Z',
  completedAt: '2025-06-01T10:05:00Z',
}

describe('Order total calculation with tax and discount', () => {
  it('calculates item subtotal correctly', () => {
    expect(calcItemSubtotal(baseItems[0])).toBe(50_000) // 2 * 25000
    expect(calcItemSubtotal(baseItems[1])).toBe(25_000) // 1 * 30000 - 5000
  })

  it('calculates order subtotal across all items', () => {
    expect(calcOrderSubtotal(baseItems)).toBe(75_000)
  })

  it('applies tax correctly', () => {
    expect(calcOrderTax(75_000, 0.11)).toBe(8_250)
  })

  it('calculates total with tax and order-level discount', () => {
    const order = { ...baseOrder, discountAmount: 10_000 }
    // subtotal=75000, tax=8250, discount=10000 → 73250
    expect(calcOrderTotal(order)).toBe(73_250)
  })

  it('calculates total with zero tax and zero discount', () => {
    const order = { ...baseOrder, taxRate: 0, discountAmount: 0 }
    expect(calcOrderTotal(order)).toBe(75_000)
  })

  it('total never goes below zero even with huge discount', () => {
    const order = { ...baseOrder, discountAmount: 999_999 }
    expect(calcOrderTotal(order)).toBe(0)
  })
})

describe('Order status machine', () => {
  it('can transition PENDING → COMPLETED', () => {
    expect(canTransition('PENDING', 'COMPLETED')).toBe(true)
  })

  it('can transition PENDING → CANCELLED', () => {
    expect(canTransition('PENDING', 'CANCELLED')).toBe(true)
  })

  it('can transition COMPLETED → REFUNDED', () => {
    expect(canTransition('COMPLETED', 'REFUNDED')).toBe(true)
  })

  it('cannot transition COMPLETED → PENDING', () => {
    expect(canTransition('COMPLETED', 'PENDING')).toBe(false)
  })

  it('cannot transition from terminal states', () => {
    expect(canTransition('CANCELLED', 'PENDING')).toBe(false)
    expect(canTransition('REFUNDED', 'COMPLETED')).toBe(false)
  })

  it('transitionOrder returns error for invalid transition', () => {
    const order = { ...baseOrder, status: 'CANCELLED' as OrderStatus }
    const result = transitionOrder(order, 'COMPLETED')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('CANCELLED')
  })

  it('transitionOrder succeeds for valid transition', () => {
    const order = { ...baseOrder, status: 'PENDING' as OrderStatus }
    const result = transitionOrder(order, 'COMPLETED')
    expect(result.ok).toBe(true)
    expect(result.order?.status).toBe('COMPLETED')
  })
})

describe('Refund eligibility', () => {
  it('COMPLETED order within 30 days is eligible', () => {
    const order = { ...baseOrder, completedAt: '2025-06-01T10:00:00Z' }
    const result = isRefundEligible(order, '2025-06-15T10:00:00Z')
    expect(result.eligible).toBe(true)
  })

  it('COMPLETED order older than 30 days is not eligible', () => {
    const order = { ...baseOrder, completedAt: '2025-01-01T10:00:00Z' }
    const result = isRefundEligible(order, '2025-06-01T10:00:00Z')
    expect(result.eligible).toBe(false)
    expect(result.reason).toContain('30 hari')
  })

  it('non-COMPLETED order is not eligible', () => {
    const order = { ...baseOrder, status: 'PENDING' as OrderStatus }
    const result = isRefundEligible(order)
    expect(result.eligible).toBe(false)
    expect(result.reason).toContain('COMPLETED')
  })

  it('CANCELLED order is not eligible for refund', () => {
    const order = { ...baseOrder, status: 'CANCELLED' as OrderStatus }
    const result = isRefundEligible(order)
    expect(result.eligible).toBe(false)
  })

  it('already REFUNDED order is not eligible again', () => {
    const order = { ...baseOrder, status: 'REFUNDED' as OrderStatus }
    const result = isRefundEligible(order)
    expect(result.eligible).toBe(false)
  })
})

describe('Payment method validation', () => {
  it('accepts all valid payment methods', () => {
    expect(validatePaymentMethod('CASH')).toBe(true)
    expect(validatePaymentMethod('CARD')).toBe(true)
    expect(validatePaymentMethod('TRANSFER')).toBe(true)
    expect(validatePaymentMethod('QRIS')).toBe(true)
    expect(validatePaymentMethod('WALLET')).toBe(true)
  })

  it('rejects unknown payment method', () => {
    expect(validatePaymentMethod('BITCOIN')).toBe(false)
    expect(validatePaymentMethod('')).toBe(false)
    expect(validatePaymentMethod('cash')).toBe(false) // case-sensitive
  })
})

describe('Order number generation', () => {
  it('generates padded sequential order number', () => {
    expect(generateOrderNumber('STR', 1)).toBe('STR-000001')
    expect(generateOrderNumber('STR', 999)).toBe('STR-000999')
  })

  it('handles large sequence numbers', () => {
    expect(generateOrderNumber('STR', 1_000_000)).toBe('STR-1000000')
  })

  it('uses store prefix correctly', () => {
    expect(generateOrderNumber('JKT01', 42)).toBe('JKT01-000042')
  })
})
