import { describe, it, expect } from 'vitest'
import {
  calcItemTotal,
  calcSubtotal,
  calcTaxAmount,
  calcTotal,
  isOverdue,
  daysOverdue,
  generateInvoiceNumber,
  parseInvoiceSeq,
  isValidStatusTransition,
  statusAfterPayment,
  validatePaymentAmount,
} from '@/lib/invoices'

describe('Invoice Module', () => {

  describe('calcItemTotal', () => {
    it('multiplies qty by unitPrice', () => {
      expect(calcItemTotal(3, 50000)).toBe(150000)
    })
    it('handles fractional quantities', () => {
      expect(calcItemTotal(2.5, 10000)).toBe(25000)
    })
  })

  describe('calcSubtotal', () => {
    it('sums all item totals', () => {
      const items = [
        { qty: 2, unitPrice: 50000 },
        { qty: 1, unitPrice: 30000 },
      ]
      expect(calcSubtotal(items)).toBe(130000)
    })
    it('returns 0 for empty items', () => {
      expect(calcSubtotal([])).toBe(0)
    })
  })

  describe('calcTaxAmount', () => {
    it('calculates 11% PPN correctly', () => {
      expect(calcTaxAmount(100000, 0.11)).toBe(11000)
    })
    it('returns 0 for zero tax rate', () => {
      expect(calcTaxAmount(100000, 0)).toBe(0)
    })
  })

  describe('calcTotal', () => {
    it('adds subtotal and taxAmount', () => {
      expect(calcTotal(100000, 11000)).toBe(111000)
    })
    it('returns subtotal when tax is 0', () => {
      expect(calcTotal(50000, 0)).toBe(50000)
    })
  })

  describe('isOverdue', () => {
    it('returns true for SENT invoice past due date', () => {
      expect(isOverdue('2020-01-01', 'SENT', new Date('2026-07-28'))).toBe(true)
    })
    it('returns false for PAID invoice even if past due', () => {
      expect(isOverdue('2020-01-01', 'PAID', new Date('2026-07-28'))).toBe(false)
    })
    it('returns false for CANCELLED invoice', () => {
      expect(isOverdue('2020-01-01', 'CANCELLED', new Date('2026-07-28'))).toBe(false)
    })
    it('returns false when due date is today', () => {
      const today = new Date()
      const todayStr = today.toISOString().split('T')[0]
      expect(isOverdue(todayStr, 'SENT', today)).toBe(false)
    })
    it('returns false for future due date', () => {
      expect(isOverdue('2099-12-31', 'SENT', new Date('2026-07-28'))).toBe(false)
    })
  })

  describe('daysOverdue', () => {
    it('returns positive number when past due', () => {
      expect(daysOverdue('2026-07-01', new Date('2026-07-28'))).toBe(27)
    })
    it('returns negative number when not yet due', () => {
      expect(daysOverdue('2026-08-28', new Date('2026-07-28'))).toBe(-31)
    })
    it('returns 0 when due today', () => {
      const today = new Date()
      const todayStr = today.toISOString().split('T')[0]
      expect(daysOverdue(todayStr, today)).toBe(0)
    })
  })

  describe('generateInvoiceNumber', () => {
    it('pads sequence to 4 digits', () => {
      expect(generateInvoiceNumber(2026, 1)).toBe('INV-2026-0001')
    })
    it('handles large sequence numbers', () => {
      expect(generateInvoiceNumber(2026, 1000)).toBe('INV-2026-1000')
    })
  })

  describe('parseInvoiceSeq', () => {
    it('extracts sequence from valid invoice number', () => {
      expect(parseInvoiceSeq('INV-2026-0042')).toBe(42)
    })
    it('returns 0 for invalid format', () => {
      expect(parseInvoiceSeq('INVALID')).toBe(0)
    })
  })

  describe('isValidStatusTransition', () => {
    it('allows DRAFT to SENT', () => {
      expect(isValidStatusTransition('DRAFT', 'SENT')).toBe(true)
    })
    it('allows SENT to PAID', () => {
      expect(isValidStatusTransition('SENT', 'PAID')).toBe(true)
    })
    it('allows OVERDUE to PAID', () => {
      expect(isValidStatusTransition('OVERDUE', 'PAID')).toBe(true)
    })
    it('disallows PAID to DRAFT', () => {
      expect(isValidStatusTransition('PAID', 'DRAFT')).toBe(false)
    })
    it('disallows DRAFT to PAID directly', () => {
      expect(isValidStatusTransition('DRAFT', 'PAID')).toBe(false)
    })
    it('disallows CANCELLED to SENT', () => {
      expect(isValidStatusTransition('CANCELLED', 'SENT')).toBe(false)
    })
  })

  describe('statusAfterPayment', () => {
    it('returns PAID when amount covers full total', () => {
      expect(statusAfterPayment(100000, 100000, 'SENT')).toBe('PAID')
    })
    it('returns PAID when amount exceeds total', () => {
      expect(statusAfterPayment(100000, 110000, 'SENT')).toBe('PAID')
    })
    it('returns original status for partial payment', () => {
      expect(statusAfterPayment(100000, 50000, 'SENT')).toBe('SENT')
    })
    it('returns CANCELLED for cancelled invoice regardless of payment', () => {
      expect(statusAfterPayment(100000, 100000, 'CANCELLED')).toBe('CANCELLED')
    })
  })

  describe('validatePaymentAmount', () => {
    it('accepts valid payment amount', () => {
      const result = validatePaymentAmount(50000, 100000, 0)
      expect(result.valid).toBe(true)
    })
    it('rejects zero payment', () => {
      const result = validatePaymentAmount(0, 100000, 0)
      expect(result.valid).toBe(false)
    })
    it('rejects negative payment', () => {
      const result = validatePaymentAmount(-1000, 100000, 0)
      expect(result.valid).toBe(false)
    })
    it('rejects payment exceeding remaining balance', () => {
      const result = validatePaymentAmount(80000, 100000, 50000)
      expect(result.valid).toBe(false)
    })
    it('accepts payment equal to remaining balance', () => {
      const result = validatePaymentAmount(50000, 100000, 50000)
      expect(result.valid).toBe(true)
    })
  })

})
