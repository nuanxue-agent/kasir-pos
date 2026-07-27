import { describe, it, expect } from 'vitest'
import { buildReceiptLines, isSerialAvailable } from '@/lib/receipt'
import type { ReceiptData } from '@/lib/receipt'

const sampleOrder: ReceiptData = {
  storeName: 'Lakoo Coffee',
  storeAddress: 'Jl. Sudirman No. 1, Jakarta',
  storePhone: '+62-21-12345678',
  orderNumber: 'TRX-00123',
  date: '2025-06-01 10:30',
  cashier: 'Budi',
  items: [
    { name: 'Kopi Susu', qty: 2, price: 25000, subtotal: 50000 },
    { name: 'Croissant', qty: 1, price: 18000, subtotal: 18000 },
  ],
  subtotal: 68000,
  taxAmt: 7480,
  total: 75480,
  paid: 100000,
  change: 24520,
  currency: 'IDR',
  paymentMethod: 'Cash',
  customerName: 'Andi Wijaya',
}

describe('buildReceiptLines', () => {
  it('generates lines for a standard order', () => {
    const lines = buildReceiptLines(sampleOrder)
    expect(lines.length).toBeGreaterThan(10)
  })

  it('includes store name as first line', () => {
    const lines = buildReceiptLines(sampleOrder)
    expect(lines[0].text).toBe('Lakoo Coffee')
    expect(lines[0].bold).toBe(true)
  })

  it('includes order number', () => {
    const lines = buildReceiptLines(sampleOrder)
    const orderLine = lines.find(
      l => l.left?.includes('TRX-00123') || l.text?.includes('TRX-00123'),
    )
    expect(orderLine).toBeDefined()
  })

  it('includes all items', () => {
    const lines = buildReceiptLines(sampleOrder)
    const itemNames = lines.filter(l => l.left === 'Kopi Susu' || l.left === 'Croissant')
    expect(itemNames).toHaveLength(2)
  })

  it('includes subtotal and total', () => {
    const lines = buildReceiptLines(sampleOrder)
    const subtotalLine = lines.find(l => l.left === 'Subtotal')
    const totalLine = lines.find(l => l.left === 'TOTAL')
    expect(subtotalLine).toBeDefined()
    expect(totalLine).toBeDefined()
    expect(totalLine?.bold).toBe(true)
  })

  it('includes tax when present', () => {
    const lines = buildReceiptLines(sampleOrder)
    const taxLine = lines.find(l => l.left === 'Tax')
    expect(taxLine).toBeDefined()
  })

  it('omits tax line when taxAmt is 0', () => {
    const noTax = { ...sampleOrder, taxAmt: 0 }
    const lines = buildReceiptLines(noTax)
    const taxLine = lines.find(l => l.left === 'Tax')
    expect(taxLine).toBeUndefined()
  })

  it('includes paid and change when present', () => {
    const lines = buildReceiptLines(sampleOrder)
    const paidLine = lines.find(l => l.left === 'Paid')
    const changeLine = lines.find(l => l.left === 'Change')
    expect(paidLine).toBeDefined()
    expect(changeLine).toBeDefined()
  })

  it('omits paid/change when not present', () => {
    const noPaid = { ...sampleOrder, paid: undefined, change: undefined }
    const lines = buildReceiptLines(noPaid)
    expect(lines.find(l => l.left === 'Paid')).toBeUndefined()
    expect(lines.find(l => l.left === 'Change')).toBeUndefined()
  })

  it('includes discount line when discountAmt > 0', () => {
    const withDiscount = { ...sampleOrder, discountAmt: 5000 }
    const lines = buildReceiptLines(withDiscount)
    expect(lines.find(l => l.left === 'Discount')).toBeDefined()
  })

  it('omits discount line when discountAmt is 0', () => {
    const noDiscount = { ...sampleOrder, discountAmt: 0 }
    const lines = buildReceiptLines(noDiscount)
    expect(lines.find(l => l.left === 'Discount')).toBeUndefined()
  })

  it('includes customer name when provided', () => {
    const lines = buildReceiptLines(sampleOrder)
    const customerLine = lines.find(l => l.text?.includes('Andi Wijaya'))
    expect(customerLine).toBeDefined()
  })

  it('includes receiptNote when provided', () => {
    const withNote = { ...sampleOrder, receiptNote: 'Silahkan kunjungi kembali!' }
    const lines = buildReceiptLines(withNote)
    expect(lines.find(l => l.text?.includes('Silahkan kunjungi kembali!'))).toBeDefined()
  })

  it('works with USD currency', () => {
    const usd = { ...sampleOrder, currency: 'USD', total: 12.5 }
    const lines = buildReceiptLines(usd)
    const totalLine = lines.find(l => l.left === 'TOTAL')
    expect(totalLine?.right).toContain('12')
  })

  it('works with EUR currency', () => {
    const eur = { ...sampleOrder, currency: 'EUR', total: 9.99 }
    const lines = buildReceiptLines(eur)
    expect(lines.length).toBeGreaterThan(5)
  })

  it('handles empty items list', () => {
    const empty = { ...sampleOrder, items: [], subtotal: 0, total: 0 }
    expect(() => buildReceiptLines(empty)).not.toThrow()
  })

  it('includes thank you message at end', () => {
    const lines = buildReceiptLines(sampleOrder)
    const thankYou = lines.find(l => l.text === 'Thank you!')
    expect(thankYou).toBeDefined()
    expect(thankYou?.bold).toBe(true)
  })

  it('has dividers for visual separation', () => {
    const lines = buildReceiptLines(sampleOrder)
    const dividers = lines.filter(l => l.type === 'divider')
    expect(dividers.length).toBeGreaterThanOrEqual(3)
  })
})

describe('isSerialAvailable', () => {
  it('returns false in test environment (no browser)', () => {
    expect(isSerialAvailable()).toBe(false)
  })
})

describe('Receipt currency formatting', () => {
  const currencies = [
    'IDR',
    'USD',
    'EUR',
    'GBP',
    'SGD',
    'MYR',
    'THB',
    'VND',
    'CNY',
    'JPY',
    'AED',
    'SAR',
  ]

  currencies.forEach(currency => {
    it(`handles ${currency} currency`, () => {
      const receipt = { ...sampleOrder, currency }
      expect(() => buildReceiptLines(receipt)).not.toThrow()
      const lines = buildReceiptLines(receipt)
      expect(lines.length).toBeGreaterThan(5)
    })
  })
})

describe('Receipt HTML structure (renderLineHTML via buildReceiptLines)', () => {
  it('store name line has center alignment', () => {
    const lines = buildReceiptLines(sampleOrder)
    expect(lines[0].align).toBe('center')
  })

  it('TOTAL line has bold flag', () => {
    const lines = buildReceiptLines(sampleOrder)
    const totalLine = lines.find(l => l.left === 'TOTAL')
    expect(totalLine?.bold).toBe(true)
  })

  it('store address line has small size', () => {
    const lines = buildReceiptLines(sampleOrder)
    const addrLine = lines.find(l => l.text === sampleOrder.storeAddress)
    expect(addrLine?.size).toBe('small')
  })

  it('store name line has large size', () => {
    const lines = buildReceiptLines(sampleOrder)
    expect(lines[0].size).toBe('large')
  })

  it('omits address line when not provided', () => {
    const noAddr = { ...sampleOrder, storeAddress: undefined }
    const lines = buildReceiptLines(noAddr)
    expect(lines.find(l => l.text === sampleOrder.storeAddress)).toBeUndefined()
  })

  it('includes taxId when provided', () => {
    const withTaxId = { ...sampleOrder, taxId: 'NPWP-123456' }
    const lines = buildReceiptLines(withTaxId)
    expect(lines.find(l => l.text?.includes('NPWP-123456'))).toBeDefined()
  })

  it('includes loyalty points line when points > 0', () => {
    const withPoints = { ...sampleOrder, points: 150 }
    const lines = buildReceiptLines(withPoints)
    expect(lines.find(l => l.text?.includes('150'))).toBeDefined()
  })

  it('item subtotals appear as right values on item lines', () => {
    const lines = buildReceiptLines(sampleOrder)
    const kopiLine = lines.find(l => l.left === 'Kopi Susu')
    expect(kopiLine).toBeDefined()
    expect(kopiLine?.right).toBeDefined()
  })

  it('payment method line included when provided', () => {
    const lines = buildReceiptLines(sampleOrder)
    const pmLine = lines.find(l => l.text?.includes('Cash'))
    expect(pmLine).toBeDefined()
  })

  it('cashier name included when provided', () => {
    const lines = buildReceiptLines(sampleOrder)
    const cashierLine = lines.find(l => l.text?.includes('Budi'))
    expect(cashierLine).toBeDefined()
  })

  it('change value is IDR formatted (contains number)', () => {
    const lines = buildReceiptLines(sampleOrder)
    const changeLine = lines.find(l => l.left === 'Change')
    expect(changeLine?.right).toBeDefined()
    expect(changeLine!.right!.length).toBeGreaterThan(0)
  })
})

describe('Receipt with zero-value edge cases', () => {
  it('zero total receipt does not throw', () => {
    const free = { ...sampleOrder, subtotal: 0, total: 0, taxAmt: 0, paid: 0, change: 0 }
    expect(() => buildReceiptLines(free)).not.toThrow()
  })

  it('very large total (IDR millions) renders without error', () => {
    const big = { ...sampleOrder, subtotal: 50000000, total: 55000000, taxAmt: 5000000 }
    const lines = buildReceiptLines(big)
    expect(lines.find(l => l.left === 'TOTAL')).toBeDefined()
  })
})
