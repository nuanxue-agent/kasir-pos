import { describe, it, expect } from 'vitest'

// ── Types ─────────────────────────────────────────────────────────────────────

type InvoiceStatus = 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE'
type AgingBucket = '0-30' | '31-60' | '61-90' | '90+'

interface SupplierInvoice {
  id: string
  storeId: string
  vendorId: string
  invoiceNumber: string
  amount: number
  tax: number
  total: number
  dueDate: string
  status: InvoiceStatus
  createdAt: string
}

interface SupplierPayment {
  id: string
  invoiceId: string
  storeId: string
  amount: number
  paymentMethod: string
  paidAt: string
  note: string | null
}

// ── Pure business-logic functions (mirrors API logic) ─────────────────────────

function calcInvoiceTotal(amount: number, tax: number): number {
  return amount + tax
}

function calcBalance(total: number, payments: SupplierPayment[]): number {
  const paid = payments.reduce((s, p) => s + p.amount, 0)
  return total - paid
}

function calcTotalPaid(payments: SupplierPayment[]): number {
  return payments.reduce((s, p) => s + p.amount, 0)
}

function isOverdue(dueDate: string, today: string): boolean {
  return new Date(dueDate) < new Date(today)
}

function getInvoiceStatus(total: number, payments: SupplierPayment[], dueDate: string, today: string): InvoiceStatus {
  const paid = calcTotalPaid(payments)
  if (paid >= total - 0.001) return 'PAID'
  if (paid > 0) {
    if (isOverdue(dueDate, today)) return 'OVERDUE'
    return 'PARTIAL'
  }
  if (isOverdue(dueDate, today)) return 'OVERDUE'
  return 'PENDING'
}

function getAgingBucket(dueDate: string, today: string): AgingBucket {
  const due = new Date(dueDate)
  const now = new Date(today)
  const diffMs = now.getTime() - due.getTime()
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (days <= 0) return '0-30'
  if (days <= 30) return '0-30'
  if (days <= 60) return '31-60'
  if (days <= 90) return '61-90'
  return '90+'
}

function calcBulkPaymentTotal(invoices: { balance: number }[]): number {
  return invoices.reduce((s, i) => s + i.balance, 0)
}

function groupByAgingBucket(
  invoices: (SupplierInvoice & { paid: number; balance: number })[],
  today: string
): Record<AgingBucket, (SupplierInvoice & { paid: number; balance: number })[]> {
  const buckets: Record<AgingBucket, (SupplierInvoice & { paid: number; balance: number })[]> = {
    '0-30': [], '31-60': [], '61-90': [], '90+': [],
  }
  for (const inv of invoices) {
    const bucket = getAgingBucket(inv.dueDate, today)
    buckets[bucket].push(inv)
  }
  return buckets
}

// ── Test fixtures ──────────────────────────────────────────────────────────────

function makeInvoice(overrides: Partial<SupplierInvoice> = {}): SupplierInvoice {
  return {
    id: 'inv-1', storeId: 's1', vendorId: 'v1',
    invoiceNumber: 'INV-001', amount: 1_000_000, tax: 110_000,
    total: 1_110_000, dueDate: '2024-01-15', status: 'PENDING',
    createdAt: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

function makePayment(overrides: Partial<SupplierPayment> = {}): SupplierPayment {
  return {
    id: 'pay-1', invoiceId: 'inv-1', storeId: 's1',
    amount: 500_000, paymentMethod: 'TRANSFER',
    paidAt: '2024-01-10T00:00:00Z', note: null,
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Invoice aging bucket calculation', () => {
  it('places invoice 10 days overdue in 0-30 bucket', () => {
    expect(getAgingBucket('2024-01-01', '2024-01-11')).toBe('0-30')
  })

  it('places invoice 45 days overdue in 31-60 bucket', () => {
    expect(getAgingBucket('2024-01-01', '2024-02-15')).toBe('31-60')
  })

  it('places invoice 75 days overdue in 61-90 bucket', () => {
    expect(getAgingBucket('2024-01-01', '2024-03-16')).toBe('61-90')
  })

  it('places invoice 100 days overdue in 90+ bucket', () => {
    expect(getAgingBucket('2024-01-01', '2024-04-10')).toBe('90+')
  })
})

describe('Payment balance calculation (total - paid)', () => {
  it('returns full total when no payments made', () => {
    const inv = makeInvoice()
    expect(calcBalance(inv.total, [])).toBe(1_110_000)
  })

  it('returns correct balance after partial payment', () => {
    const inv = makeInvoice()
    const payments = [makePayment({ amount: 400_000 })]
    expect(calcBalance(inv.total, payments)).toBe(710_000)
  })

  it('returns zero balance after full payment', () => {
    const inv = makeInvoice()
    const payments = [makePayment({ amount: 1_110_000 })]
    expect(calcBalance(inv.total, payments)).toBe(0)
  })
})

describe('Overdue detection', () => {
  it('detects invoice past due date as overdue', () => {
    expect(isOverdue('2024-01-01', '2024-02-01')).toBe(true)
  })

  it('does not flag invoice due today as overdue', () => {
    expect(isOverdue('2024-01-15', '2024-01-15')).toBe(false)
  })

  it('does not flag future invoice as overdue', () => {
    expect(isOverdue('2024-03-01', '2024-01-15')).toBe(false)
  })
})

describe('Partial payment tracking', () => {
  it('status is PARTIAL after one partial payment before due date', () => {
    const status = getInvoiceStatus(1_110_000, [makePayment({ amount: 500_000 })], '2024-02-01', '2024-01-10')
    expect(status).toBe('PARTIAL')
  })

  it('status is PAID after full payment', () => {
    const status = getInvoiceStatus(1_110_000, [makePayment({ amount: 1_110_000 })], '2024-02-01', '2024-01-10')
    expect(status).toBe('PAID')
  })

  it('status is OVERDUE when partially paid past due date', () => {
    const status = getInvoiceStatus(1_110_000, [makePayment({ amount: 500_000 })], '2024-01-01', '2024-02-01')
    expect(status).toBe('OVERDUE')
  })
})

describe('Bulk payment total', () => {
  it('sums balances of multiple invoices correctly', () => {
    const invoices = [
      { balance: 500_000 },
      { balance: 300_000 },
      { balance: 200_000 },
    ]
    expect(calcBulkPaymentTotal(invoices)).toBe(1_000_000)
  })

  it('returns zero for empty invoice list', () => {
    expect(calcBulkPaymentTotal([])).toBe(0)
  })
})
