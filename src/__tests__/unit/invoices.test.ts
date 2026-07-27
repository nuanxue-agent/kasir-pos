import { describe, it, expect } from 'vitest'

// ── Types ─────────────────────────────────────────────────────────────────────

type InvoiceStatus = 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE'
type PaymentTerms = 'NET7' | 'NET14' | 'NET30' | 'NET60'

interface InvoiceItem {
  description: string
  qty: number
  unitPrice: number
  taxRate: number // percentage, e.g. 11 = 11%
}

interface Invoice {
  id: string
  number: string
  status: InvoiceStatus
  issueDate: string
  dueDate: string
  terms: PaymentTerms
  items: InvoiceItem[]
  subtotal: number
  taxAmount: number
  total: number
}

// ── Pure business logic functions (mirrored from InvoiceClient + API) ─────────

const TERMS_DAYS: Record<PaymentTerms, number> = {
  NET7: 7,
  NET14: 14,
  NET30: 30,
  NET60: 60,
}

/** Generate invoice number: INV-YYYYMMDD-XXXX */
function generateInvoiceNumber(date: string, seq: number): string {
  const d = date.replace(/-/g, '')
  return `INV-${d}-${String(seq).padStart(4, '0')}`
}

/** Calculate due date by adding terms days to issue date */
function calcDueDate(issueDate: string, terms: PaymentTerms): string {
  const d = new Date(issueDate)
  d.setDate(d.getDate() + TERMS_DAYS[terms])
  return d.toISOString().slice(0, 10)
}

/** Detect if an invoice is overdue (past due date and not yet paid) */
function isOverdue(dueDate: string, status: InvoiceStatus, today: string): boolean {
  if (status === 'PAID') return false
  return dueDate < today
}

/** Calculate line item subtotal (qty * unitPrice, before tax) */
function calcLineSubtotal(qty: number, unitPrice: number): number {
  return qty * unitPrice
}

/** Calculate tax amount for a single line item */
function calcLineTax(qty: number, unitPrice: number, taxRate: number): number {
  return Math.round(calcLineSubtotal(qty, unitPrice) * (taxRate / 100))
}

/** Calculate invoice-level totals from line items */
function calcInvoiceTotals(items: InvoiceItem[]): {
  subtotal: number
  taxAmount: number
  total: number
} {
  const subtotal = items.reduce((s, i) => s + calcLineSubtotal(i.qty, i.unitPrice), 0)
  const taxAmount = items.reduce((s, i) => s + calcLineTax(i.qty, i.unitPrice, i.taxRate), 0)
  return { subtotal, taxAmount, total: subtotal + taxAmount }
}

/** Validate that an invoice can transition to PAID */
function canMarkPaid(status: InvoiceStatus): boolean {
  return status === 'SENT' || status === 'OVERDUE'
}

/** Validate that an invoice can be sent */
function canSend(status: InvoiceStatus): boolean {
  return status === 'DRAFT'
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Invoice number generation', () => {
  it('generates correct format INV-YYYYMMDD-XXXX', () => {
    expect(generateInvoiceNumber('2024-01-15', 1)).toBe('INV-20240115-0001')
  })

  it('pads sequence number to 4 digits', () => {
    expect(generateInvoiceNumber('2024-06-01', 42)).toBe('INV-20240601-0042')
  })

  it('handles sequence number at 1000', () => {
    expect(generateInvoiceNumber('2024-12-31', 1000)).toBe('INV-20241231-1000')
  })
})

describe('Due date calculation by payment terms', () => {
  it('NET7 adds 7 days', () => {
    expect(calcDueDate('2024-01-01', 'NET7')).toBe('2024-01-08')
  })

  it('NET14 adds 14 days', () => {
    expect(calcDueDate('2024-01-01', 'NET14')).toBe('2024-01-15')
  })

  it('NET30 adds 30 days', () => {
    expect(calcDueDate('2024-01-01', 'NET30')).toBe('2024-01-31')
  })

  it('NET60 adds 60 days', () => {
    expect(calcDueDate('2024-01-01', 'NET60')).toBe('2024-03-01')
  })

  it('handles month boundary correctly', () => {
    expect(calcDueDate('2024-01-31', 'NET7')).toBe('2024-02-07')
  })
})

describe('Overdue detection', () => {
  it('marks overdue when past due date and not paid', () => {
    expect(isOverdue('2024-01-01', 'SENT', '2024-01-15')).toBe(true)
  })

  it('does not mark overdue when paid', () => {
    expect(isOverdue('2024-01-01', 'PAID', '2024-01-15')).toBe(false)
  })

  it('does not mark overdue when due date is today', () => {
    expect(isOverdue('2024-01-15', 'SENT', '2024-01-15')).toBe(false)
  })

  it('does not mark overdue when due date is in the future', () => {
    expect(isOverdue('2024-02-01', 'SENT', '2024-01-15')).toBe(false)
  })
})

describe('Line item total calculation', () => {
  it('calculates subtotal as qty * unitPrice', () => {
    expect(calcLineSubtotal(3, 50000)).toBe(150000)
  })

  it('calculates zero subtotal for zero qty', () => {
    expect(calcLineSubtotal(0, 50000)).toBe(0)
  })

  it('calculates invoice subtotal across multiple items', () => {
    const items: InvoiceItem[] = [
      { description: 'A', qty: 2, unitPrice: 100000, taxRate: 11 },
      { description: 'B', qty: 5, unitPrice: 20000, taxRate: 0 },
    ]
    expect(calcInvoiceTotals(items).subtotal).toBe(300000)
  })

  it('sums items into correct total including tax', () => {
    const items: InvoiceItem[] = [{ description: 'X', qty: 1, unitPrice: 100000, taxRate: 11 }]
    const { subtotal, taxAmount, total } = calcInvoiceTotals(items)
    expect(subtotal).toBe(100000)
    expect(taxAmount).toBe(11000)
    expect(total).toBe(111000)
  })
})

describe('Tax amount computation', () => {
  it('computes 11% PPN correctly', () => {
    expect(calcLineTax(1, 100000, 11)).toBe(11000)
  })

  it('computes 0% tax as zero', () => {
    expect(calcLineTax(10, 50000, 0)).toBe(0)
  })

  it('rounds fractional tax amounts', () => {
    // 3 * 33333 = 99999, tax 11% = 10999.89 → Math.round = 11000
    expect(calcLineTax(3, 33333, 11)).toBe(11000)
  })

  it('calculates total tax across mixed-rate items', () => {
    const items: InvoiceItem[] = [
      { description: 'Taxed', qty: 1, unitPrice: 100000, taxRate: 11 },
      { description: 'Exempt', qty: 2, unitPrice: 50000, taxRate: 0 },
    ]
    expect(calcInvoiceTotals(items).taxAmount).toBe(11000)
  })
})

describe('Invoice status transitions', () => {
  it('DRAFT invoice can be sent', () => {
    expect(canSend('DRAFT')).toBe(true)
  })

  it('SENT invoice cannot be sent again', () => {
    expect(canSend('SENT')).toBe(false)
  })

  it('SENT invoice can be marked paid', () => {
    expect(canMarkPaid('SENT')).toBe(true)
  })

  it('OVERDUE invoice can be marked paid', () => {
    expect(canMarkPaid('OVERDUE')).toBe(true)
  })

  it('PAID invoice cannot be marked paid again', () => {
    expect(canMarkPaid('PAID')).toBe(false)
  })
})
