import { describe, it, expect } from 'vitest'

// ─── Types ────────────────────────────────────────────────────────────────────

type OrderStatus = 'PENDING' | 'PAID' | 'VOIDED' | 'REFUNDED'

interface OrderItem {
  id: string
  productId: string
  name: string
  qty: number
  price: number
  subtotal: number
  discount: number
}

interface Payment {
  id: string
  method: string
  amount: number
  change: number
  reference?: string | null
}

interface Order {
  id: string
  number: string
  status: OrderStatus
  subtotal: number
  discountAmt: number
  taxAmt: number
  total: number
  createdAt: string
  items: OrderItem[]
  payments: Payment[]
}

// ─── Pure helpers (mirroring component / API logic) ──────────────────────────

const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'Cash',
  CARD: 'Card',
  TRANSFER: 'Bank Transfer',
  QRIS: 'QRIS',
  OTHER: 'Other',
}

function calcOrderTotal(items: OrderItem[], discountAmt: number, taxAmt: number): number {
  const subtotal = items.reduce((s, i) => s + i.subtotal, 0)
  return Math.max(0, subtotal - discountAmt + taxAmt)
}

function calcTaxAmount(subtotal: number, taxRate: number): number {
  return Math.round(subtotal * taxRate)
}

function calcTotalPaid(payments: Payment[]): number {
  return payments.reduce((s, p) => s + p.amount, 0)
}

function calcChange(payments: Payment[]): number {
  return payments.reduce((s, p) => s + p.change, 0)
}

function isRefundEligible(order: Order): { eligible: boolean; reason?: string } {
  if (order.status !== 'PAID') {
    return {
      eligible: false,
      reason: `Only PAID orders can be refunded, current status: ${order.status}`,
    }
  }
  return { eligible: true }
}

function getPaymentMethodLabel(method: string): string {
  return PAYMENT_LABELS[method] ?? method
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const baseItems: OrderItem[] = [
  {
    id: 'i1',
    productId: 'p1',
    name: 'Kopi Susu',
    qty: 2,
    price: 25_000,
    subtotal: 50_000,
    discount: 0,
  },
  {
    id: 'i2',
    productId: 'p2',
    name: 'Croissant',
    qty: 1,
    price: 30_000,
    subtotal: 25_000,
    discount: 5_000,
  },
]

const basePayments: Payment[] = [{ id: 'pay1', method: 'CASH', amount: 100_000, change: 16_750 }]

const baseOrder: Order = {
  id: 'ord-1',
  number: 'INV-0001',
  status: 'PAID',
  subtotal: 75_000,
  discountAmt: 0,
  taxAmt: 8_250,
  total: 83_250,
  createdAt: '2026-07-01T10:00:00Z',
  items: baseItems,
  payments: basePayments,
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Order total calculation', () => {
  it('calculates total as subtotal - discount + tax', () => {
    const total = calcOrderTotal(baseItems, 0, 8_250)
    expect(total).toBe(83_250)
  })

  it('applies order-level discount correctly', () => {
    const total = calcOrderTotal(baseItems, 10_000, 8_250)
    expect(total).toBe(73_250)
  })

  it('total never goes below zero with massive discount', () => {
    const total = calcOrderTotal(baseItems, 999_999, 0)
    expect(total).toBe(0)
  })
})

describe('Tax calculation', () => {
  it('calculates 11% tax on subtotal', () => {
    expect(calcTaxAmount(75_000, 0.11)).toBe(8_250)
  })

  it('returns zero tax when taxRate is 0', () => {
    expect(calcTaxAmount(75_000, 0)).toBe(0)
  })

  it('rounds tax to nearest integer', () => {
    // 10001 * 0.11 = 1100.11 → rounds to 1100
    expect(calcTaxAmount(10_001, 0.11)).toBe(1_100)
  })
})

describe('Refund eligibility', () => {
  it('PAID order is eligible for refund', () => {
    const result = isRefundEligible(baseOrder)
    expect(result.eligible).toBe(true)
  })

  it('REFUNDED order is not eligible', () => {
    const result = isRefundEligible({ ...baseOrder, status: 'REFUNDED' })
    expect(result.eligible).toBe(false)
    expect(result.reason).toContain('REFUNDED')
  })

  it('VOIDED order is not eligible', () => {
    const result = isRefundEligible({ ...baseOrder, status: 'VOIDED' })
    expect(result.eligible).toBe(false)
  })

  it('PENDING order is not eligible', () => {
    const result = isRefundEligible({ ...baseOrder, status: 'PENDING' })
    expect(result.eligible).toBe(false)
    expect(result.reason).toContain('PAID')
  })
})

describe('Payment method display', () => {
  it('maps CASH to "Cash"', () => {
    expect(getPaymentMethodLabel('CASH')).toBe('Cash')
  })

  it('maps TRANSFER to "Bank Transfer"', () => {
    expect(getPaymentMethodLabel('TRANSFER')).toBe('Bank Transfer')
  })

  it('maps QRIS to "QRIS"', () => {
    expect(getPaymentMethodLabel('QRIS')).toBe('QRIS')
  })

  it('falls back to raw method for unknown values', () => {
    expect(getPaymentMethodLabel('EWALLET')).toBe('EWALLET')
  })
})

describe('Change calculation', () => {
  it('calculates total change from all payments', () => {
    const payments: Payment[] = [
      { id: 'p1', method: 'CASH', amount: 100_000, change: 16_750 },
      { id: 'p2', method: 'CASH', amount: 50_000, change: 0 },
    ]
    expect(calcChange(payments)).toBe(16_750)
  })

  it('returns 0 when no change given', () => {
    const payments: Payment[] = [{ id: 'p1', method: 'QRIS', amount: 83_250, change: 0 }]
    expect(calcChange(payments)).toBe(0)
    expect(calcTotalPaid(payments)).toBe(83_250)
  })
})
