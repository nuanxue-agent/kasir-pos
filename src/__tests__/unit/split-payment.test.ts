import { describe, it, expect } from 'vitest'
import { buildReceiptLines } from '@/lib/receipt'

// ── Business logic helpers (mirrored from CheckoutModal / pos-split-payment) ──

type PaymentMethod = 'CASH' | 'CARD' | 'TRANSFER' | 'QRIS'

interface PaymentLine {
  method: PaymentMethod
  amount: number
  change?: number
}

function totalPaid(payments: PaymentLine[]): number {
  return payments.reduce((sum, p) => sum + p.amount, 0)
}

function isPaymentSufficient(payments: PaymentLine[], orderTotal: number): boolean {
  return totalPaid(payments) >= orderTotal
}

function calcCashChange(payments: PaymentLine[], orderTotal: number): number {
  const nonCashTotal = payments
    .filter(p => p.method !== 'CASH')
    .reduce((sum, p) => sum + p.amount, 0)
  const cashLines = payments.filter(p => p.method === 'CASH')
  if (cashLines.length === 0) return 0
  const cashPaid = cashLines.reduce((sum, p) => sum + p.amount, 0)
  const remainingAfterNonCash = Math.max(0, orderTotal - nonCashTotal)
  return Math.max(0, cashPaid - remainingAfterNonCash)
}

// ── Shared receipt data factory ───────────────────────────────────────────────

function makeReceiptData(payments: PaymentLine[]) {
  return {
    storeName: 'Test Store',
    orderNumber: 'INV-001',
    date: '2026-07-28',
    currency: 'IDR',
    items: [{ name: 'Produk A', qty: 2, price: 25000, subtotal: 50000 }],
    subtotal: 50000,
    taxAmt: 0,
    total: 50000,
    payments,
  }
}

// ── Test suites ───────────────────────────────────────────────────────────────

describe('Split Payment — multiple payment lines sum correctly', () => {
  it('CASH + QRIS summing to exact order total is sufficient', () => {
    const payments: PaymentLine[] = [
      { method: 'CASH', amount: 25000 },
      { method: 'QRIS', amount: 25000 },
    ]
    expect(totalPaid(payments)).toBe(50000)
    expect(isPaymentSufficient(payments, 50000)).toBe(true)
  })

  it('CASH + CARD + TRANSFER — three lines sum correctly', () => {
    const payments: PaymentLine[] = [
      { method: 'CASH', amount: 20000 },
      { method: 'CARD', amount: 15000 },
      { method: 'TRANSFER', amount: 15000 },
    ]
    expect(totalPaid(payments)).toBe(50000)
    expect(isPaymentSufficient(payments, 50000)).toBe(true)
  })

  it('underpayment across multiple lines is rejected', () => {
    const payments: PaymentLine[] = [
      { method: 'CASH', amount: 10000 },
      { method: 'QRIS', amount: 15000 },
    ]
    expect(isPaymentSufficient(payments, 50000)).toBe(false)
  })
})

describe('Split Payment — change only from CASH portion', () => {
  it('no change when all payments are non-cash', () => {
    const payments: PaymentLine[] = [
      { method: 'QRIS', amount: 30000 },
      { method: 'CARD', amount: 25000 },
    ]
    expect(calcCashChange(payments, 50000)).toBe(0)
  })

  it('cash change = overpay when only cash line', () => {
    const payments: PaymentLine[] = [{ method: 'CASH', amount: 60000 }]
    expect(calcCashChange(payments, 50000)).toBe(10000)
  })

  it('cash change only covers what cash overpays after QRIS share', () => {
    // QRIS 30000 + CASH 25000 on a 50000 order → cash owes 20000, change = 5000
    const payments: PaymentLine[] = [
      { method: 'QRIS', amount: 30000 },
      { method: 'CASH', amount: 25000 },
    ]
    expect(calcCashChange(payments, 50000)).toBe(5000)
  })

  it('zero change when cash exactly covers its portion', () => {
    const payments: PaymentLine[] = [
      { method: 'QRIS', amount: 25000 },
      { method: 'CASH', amount: 25000 },
    ]
    expect(calcCashChange(payments, 50000)).toBe(0)
  })
})

describe('Split Payment — validation: underpayment rejected', () => {
  it('rejects when single CASH is short', () => {
    expect(isPaymentSufficient([{ method: 'CASH', amount: 40000 }], 50000)).toBe(false)
  })

  it('rejects when split sum is still short', () => {
    const payments: PaymentLine[] = [
      { method: 'CASH', amount: 20000 },
      { method: 'QRIS', amount: 20000 },
    ]
    expect(isPaymentSufficient(payments, 50000)).toBe(false)
  })
})

describe('Split Payment — receipt format', () => {
  it('receipt lines include each payment method label and amount', () => {
    const data = makeReceiptData([
      { method: 'CASH', amount: 25000, change: 0 },
      { method: 'QRIS', amount: 25000, change: 0 },
    ])
    const lines = buildReceiptLines(data)
    const leftTexts = lines.filter(l => l.left).map(l => l.left)
    expect(leftTexts).toContain('TUNAI')
    expect(leftTexts).toContain('QRIS')
  })

  it('receipt shows Kembalian line when cash change > 0', () => {
    const data = makeReceiptData([{ method: 'CASH', amount: 60000, change: 10000 }])
    const lines = buildReceiptLines(data)
    const changeLineLeft = lines.find(l => l.left === 'Kembalian')
    expect(changeLineLeft).toBeDefined()
  })

  it('receipt does NOT show Kembalian when change is zero', () => {
    const data = makeReceiptData([{ method: 'CASH', amount: 50000, change: 0 }])
    const lines = buildReceiptLines(data)
    const changeLine = lines.find(l => l.left === 'Kembalian')
    expect(changeLine).toBeUndefined()
  })

  it('receipt shows TUNAI + QRIS + Kembalian for split with cash overpay', () => {
    const data = makeReceiptData([
      { method: 'QRIS', amount: 30000, change: 0 },
      { method: 'CASH', amount: 25000, change: 5000 },
    ])
    const lines = buildReceiptLines(data)
    const leftTexts = lines.filter(l => l.left).map(l => l.left)
    expect(leftTexts).toContain('TUNAI')
    expect(leftTexts).toContain('QRIS')
    expect(leftTexts).toContain('Kembalian')
    // Kembalian amount should be 5000 — check numeric value locale-agnostically
    const kembalianLine = lines.find(l => l.left === 'Kembalian')
    expect(kembalianLine?.right).toBeDefined()
    expect(kembalianLine?.right?.replace(/[^\d]/g, '')).toBe('5000')
  })
})
