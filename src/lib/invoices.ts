// Pure business logic for invoice module — no DB, no Next.js deps
// Exported for unit testing

export type InvoiceStatus = 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE' | 'CANCELLED'

export interface InvoiceItem {
  id: string
  invoiceId: string
  storeId: string
  description: string
  qty: number
  unitPrice: number
  total: number
}

export interface Invoice {
  id: string
  storeId: string
  customerId: string
  invoiceNumber: string
  issueDate: string
  dueDate: string
  status: InvoiceStatus
  subtotal: number
  taxAmount: number
  total: number
  notes?: string | null
  paymentTerms?: string | null
  createdAt: string
  updatedAt: string
}

// ─── Calculation helpers ────────────────────────────────────────────────────

export function calcItemTotal(qty: number, unitPrice: number): number {
  return Math.round(qty * unitPrice * 100) / 100
}

export function calcSubtotal(items: Pick<InvoiceItem, 'qty' | 'unitPrice'>[]): number {
  return items.reduce((sum, item) => sum + calcItemTotal(item.qty, item.unitPrice), 0)
}

export function calcTaxAmount(subtotal: number, taxRate: number): number {
  if (taxRate <= 0) return 0
  return Math.round(subtotal * taxRate * 100) / 100
}

export function calcTotal(subtotal: number, taxAmount: number): number {
  return Math.round((subtotal + taxAmount) * 100) / 100
}

// ─── Overdue detection ───────────────────────────────────────────────────────

/**
 * Returns true when an invoice's dueDate has passed and it is not yet PAID/CANCELLED.
 * Accepts ISO date strings (YYYY-MM-DD or full ISO timestamps).
 */
export function isOverdue(dueDate: string, status: InvoiceStatus, now = new Date()): boolean {
  if (status === 'PAID' || status === 'CANCELLED') return false
  const due = new Date(dueDate)
  // Compare calendar dates using UTC to avoid timezone drift
  const dueDay = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate())
  const todayDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return todayDay > dueDay
}

/**
 * Returns the number of days an invoice is overdue (negative means days remaining).
 */
export function daysOverdue(dueDate: string, now = new Date()): number {
  const due = new Date(dueDate)
  const dueDay = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate())
  const todayDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return Math.floor((todayDay - dueDay) / 86400000)
}

// ─── Invoice number generation ───────────────────────────────────────────────

/**
 * Generates an invoice number like INV-2026-0001.
 * @param year  Full 4-digit year (e.g. 2026)
 * @param seq   1-based sequential number for the year
 */
export function generateInvoiceNumber(year: number, seq: number): string {
  return `INV-${year}-${String(seq).padStart(4, '0')}`
}

/**
 * Extracts the sequence number from an invoice number string.
 * Returns 0 if the format doesn't match.
 */
export function parseInvoiceSeq(invoiceNumber: string): number {
  const match = invoiceNumber.match(/INV-\d{4}-(\d+)/)
  if (!match) return 0
  return parseInt(match[1], 10)
}

// ─── Status helpers ──────────────────────────────────────────────────────────

export const STATUS_LABELS: Record<InvoiceStatus, string> = {
  DRAFT:     'Draft',
  SENT:      'Terkirim',
  PAID:      'Lunas',
  OVERDUE:   'Jatuh Tempo',
  CANCELLED: 'Dibatalkan',
}

export const STATUS_COLORS: Record<InvoiceStatus, string> = {
  DRAFT:     'text-gray-600 bg-gray-100 border-gray-200',
  SENT:      'text-blue-600 bg-blue-50 border-blue-200',
  PAID:      'text-emerald-600 bg-emerald-50 border-emerald-200',
  OVERDUE:   'text-red-600 bg-red-50 border-red-200',
  CANCELLED: 'text-gray-400 bg-gray-50 border-gray-200',
}

export const ALLOWED_STATUS_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  DRAFT:     ['SENT', 'CANCELLED'],
  SENT:      ['PAID', 'OVERDUE', 'CANCELLED'],
  OVERDUE:   ['PAID', 'CANCELLED'],
  PAID:      [],
  CANCELLED: [],
}

export function isValidStatusTransition(from: InvoiceStatus, to: InvoiceStatus): boolean {
  return ALLOWED_STATUS_TRANSITIONS[from]?.includes(to) ?? false
}

// ─── Payment recording helpers ───────────────────────────────────────────────

/**
 * Determines new invoice status after a payment.
 * If the payment fully covers the total the invoice becomes PAID.
 */
export function statusAfterPayment(
  invoiceTotal: number,
  amountPaid: number,
  previousStatus: InvoiceStatus,
): InvoiceStatus {
  if (previousStatus === 'CANCELLED') return 'CANCELLED'
  if (amountPaid >= invoiceTotal) return 'PAID'
  return previousStatus
}

/**
 * Validates a payment amount: must be > 0 and ≤ remaining balance.
 */
export function validatePaymentAmount(
  amount: number,
  invoiceTotal: number,
  alreadyPaid: number,
): { valid: boolean; error?: string } {
  if (amount <= 0) return { valid: false, error: 'Payment amount must be positive' }
  const remaining = invoiceTotal - alreadyPaid
  if (amount > remaining + 0.01) {
    return { valid: false, error: `Payment exceeds remaining balance of ${remaining}` }
  }
  return { valid: true }
}
