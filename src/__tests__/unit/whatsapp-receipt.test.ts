import { describe, it, expect } from 'vitest'
import { buildWhatsAppMessage, buildReceiptText } from '@/lib/receipt'
import type { ReceiptData } from '@/lib/receipt'

const sampleReceipt: ReceiptData = {
  storeName: 'Warung Makan Bahagia',
  storeAddress: 'Jl. Pahlawan No. 12, Surabaya',
  storePhone: '+62-31-99887766',
  orderNumber: 'TRX-00456',
  date: '2025-07-28 14:00',
  cashier: 'Siti',
  items: [
    { name: 'Nasi Goreng', qty: 2, price: 20000, subtotal: 40000 },
    { name: 'Es Teh Manis', qty: 3, price: 5000, subtotal: 15000 },
  ],
  subtotal: 55000,
  taxAmt: 5500,
  total: 60500,
  paid: 100000,
  change: 39500,
  currency: 'IDR',
  paymentMethod: 'Cash',
  customerName: 'Budi Santoso',
  customerPhone: '+6281234567890',
  customerEmail: 'budi@example.com',
}

// ─── buildWhatsAppMessage ─────────────────────────────────────────────────────

describe('buildWhatsAppMessage', () => {
  it('returns a non-empty string', () => {
    const result = buildWhatsAppMessage(sampleReceipt)
    expect(result.length).toBeGreaterThan(0)
  })

  it('URL-encodes the message (no raw spaces)', () => {
    const result = buildWhatsAppMessage(sampleReceipt)
    // encodeURIComponent replaces spaces with %20
    expect(result).not.toMatch(/ /)
  })

  it('encodes newlines as %0A', () => {
    const result = buildWhatsAppMessage(sampleReceipt)
    expect(result).toContain('%0A')
  })

  it('decoded result contains store name', () => {
    const result = buildWhatsAppMessage(sampleReceipt)
    expect(decodeURIComponent(result)).toContain('Warung Makan Bahagia')
  })

  it('decoded result contains order number', () => {
    const result = buildWhatsAppMessage(sampleReceipt)
    expect(decodeURIComponent(result)).toContain('TRX-00456')
  })

  it('decoded result contains total amount', () => {
    const result = buildWhatsAppMessage(sampleReceipt)
    const decoded = decodeURIComponent(result)
    // IDR uses id-ID locale — separator varies by environment (comma or dot)
    expect(decoded).toMatch(/60[,.]500/)
  })

  it('decoded result contains payment method', () => {
    const result = buildWhatsAppMessage(sampleReceipt)
    expect(decodeURIComponent(result)).toContain('Cash')
  })
})

// ─── buildReceiptText (plain text) ────────────────────────────────────────────

describe('buildReceiptText', () => {
  it('contains 🧾 receipt emoji in header', () => {
    const text = buildReceiptText(sampleReceipt)
    expect(text).toContain('🧾')
  })

  it('contains 📦 items emoji', () => {
    const text = buildReceiptText(sampleReceipt)
    expect(text).toContain('📦')
  })

  it('contains 💰 total emoji', () => {
    const text = buildReceiptText(sampleReceipt)
    expect(text).toContain('💰')
  })

  it('lists all item names', () => {
    const text = buildReceiptText(sampleReceipt)
    expect(text).toContain('Nasi Goreng')
    expect(text).toContain('Es Teh Manis')
  })

  it('includes store address when provided', () => {
    const text = buildReceiptText(sampleReceipt)
    expect(text).toContain('Jl. Pahlawan No. 12, Surabaya')
  })

  it('includes customer name when provided', () => {
    const text = buildReceiptText(sampleReceipt)
    expect(text).toContain('Budi Santoso')
  })

  it('includes discount line when discountAmt > 0', () => {
    const withDiscount = { ...sampleReceipt, discountAmt: 5000 }
    const text = buildReceiptText(withDiscount)
    expect(text).toContain('Diskon')
  })

  it('omits discount line when discountAmt is 0 or absent', () => {
    const noDiscount = { ...sampleReceipt, discountAmt: 0 }
    const text = buildReceiptText(noDiscount)
    expect(text).not.toContain('Diskon')
  })

  it('ends with thank-you message', () => {
    const text = buildReceiptText(sampleReceipt)
    expect(text).toContain('Terima kasih')
  })

  it('works with USD currency without throwing', () => {
    const usd = { ...sampleReceipt, currency: 'USD', total: 12.5 }
    expect(() => buildReceiptText(usd)).not.toThrow()
    expect(buildReceiptText(usd)).toContain('12')
  })
})
