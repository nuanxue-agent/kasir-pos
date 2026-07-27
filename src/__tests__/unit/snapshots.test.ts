import { describe, it, expect } from 'vitest'
import { buildReceiptText, buildWhatsAppMessage } from '@/lib/receipt'
import type { ReceiptData } from '@/lib/receipt'

// ─── Shared fixture ───────────────────────────────────────────────────────────

const sampleReceipt: ReceiptData = {
  storeName: 'Warung Bahagia',
  storeAddress: 'Jl. Merdeka No. 1, Jakarta',
  storePhone: '+62-21-12345678',
  orderNumber: 'INV-0042',
  date: '2025-07-28 10:00',
  cashier: 'Ahmad',
  items: [
    { name: 'Nasi Goreng', qty: 2, price: 20000, subtotal: 40000 },
    { name: 'Es Teh', qty: 1, price: 5000, subtotal: 5000 },
  ],
  subtotal: 45000,
  taxAmt: 4500,
  total: 49500,
  paid: 50000,
  change: 500,
  currency: 'IDR',
  paymentMethod: 'Cash',
  customerName: 'Budi',
}

// ─── buildReceiptText snapshots ───────────────────────────────────────────────

describe('Snapshot: buildReceiptText', () => {
  it('matches snapshot for a standard receipt', () => {
    const text = buildReceiptText(sampleReceipt)
    expect(text).toMatchSnapshot()
  })

  it('matches snapshot for receipt with discount', () => {
    const text = buildReceiptText({
      ...sampleReceipt,
      discountAmt: 5000,
      total: 44500,
    })
    expect(text).toMatchSnapshot()
  })

  it('starts with store name emoji header', () => {
    const text = buildReceiptText(sampleReceipt)
    expect(text).toContain('🧾 Warung Bahagia')
  })

  it('contains order number', () => {
    const text = buildReceiptText(sampleReceipt)
    expect(text).toContain('INV-0042')
  })

  it('contains thank-you footer', () => {
    const text = buildReceiptText(sampleReceipt)
    expect(text).toContain('Terima kasih! 🙏')
  })
})

// ─── WhatsApp message snapshot ────────────────────────────────────────────────

describe('Snapshot: buildWhatsAppMessage', () => {
  it('decoded WhatsApp message matches snapshot', () => {
    const encoded = buildWhatsAppMessage(sampleReceipt)
    const decoded = decodeURIComponent(encoded)
    expect(decoded).toMatchSnapshot()
  })

  it('encoded value has no literal spaces', () => {
    const encoded = buildWhatsAppMessage(sampleReceipt)
    expect(encoded).not.toMatch(/ /)
  })

  it('encoded value contains %0A newlines', () => {
    const encoded = buildWhatsAppMessage(sampleReceipt)
    expect(encoded).toContain('%0A')
  })
})

// ─── CSV export header row snapshot ──────────────────────────────────────────

// Pure CSV logic extracted from export.ts (avoids browser-only Blob/URL APIs)
function buildCsvHeader(columns: { key: string; label: string }[]): string {
  const escape = (v: string) =>
    v.includes(',') || v.includes('"') || v.includes('\n')
      ? `"${v.replace(/"/g, '""')}"`
      : v
  return columns.map(c => escape(c.label)).join(',')
}

describe('Snapshot: CSV export header row', () => {
  it('orders report header matches snapshot', () => {
    const columns = [
      { key: 'orderNumber', label: 'Order #' },
      { key: 'date', label: 'Date' },
      { key: 'customer', label: 'Customer' },
      { key: 'total', label: 'Total' },
      { key: 'paymentMethod', label: 'Payment Method' },
      { key: 'status', label: 'Status' },
    ]
    expect(buildCsvHeader(columns)).toMatchSnapshot()
  })

  it('products report header matches snapshot', () => {
    const columns = [
      { key: 'name', label: 'Product Name' },
      { key: 'sku', label: 'SKU' },
      { key: 'price', label: 'Price' },
      { key: 'stock', label: 'Stock' },
      { key: 'category', label: 'Category' },
    ]
    expect(buildCsvHeader(columns)).toMatchSnapshot()
  })
})
