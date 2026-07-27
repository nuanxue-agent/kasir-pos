'use client'

// ── Receipt printing utilities ────────────────────────────────────────────────
// Supports:
//   1. Browser print (window.print) — works everywhere
//   2. ESC/POS thermal printer via Web Serial API (Chrome/Edge on desktop)
//   3. ESC/POS via raw WebUSB (fallback for direct USB thermal printers)

export interface ReceiptLine {
  type: 'header' | 'divider' | 'item' | 'total' | 'text' | 'barcode' | 'qr'
  text?: string
  left?: string
  right?: string
  bold?: boolean
  align?: 'left' | 'center' | 'right'
  size?: 'normal' | 'large' | 'small'
}

export interface ReceiptData {
  storeName: string
  storeAddress?: string
  storePhone?: string
  storeLogo?: string
  receiptNote?: string
  taxId?: string
  orderNumber: string
  date: string
  cashier?: string
  items: { name: string; qty: number; price: number; subtotal: number }[]
  subtotal: number
  discountAmt?: number
  taxAmt?: number
  total: number
  paid?: number
  change?: number
  currency: string
  paymentMethod?: string
  customerName?: string
  points?: number
  /** Cashier/order note — printed on receipt when present */
  orderNote?: string
}

// ── Currency formatter ─────────────────────────────────────────────────────────

function fmt(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}

// ── Browser print ──────────────────────────────────────────────────────────────

export function printReceiptBrowser(data: ReceiptData): void {
  const lines = buildReceiptLines(data)
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Receipt ${data.orderNumber}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; font-size: 12px; width: 80mm; padding: 4mm; }
  .center { text-align: center; }
  .right { text-align: right; }
  .bold { font-weight: bold; }
  .large { font-size: 16px; }
  .small { font-size: 10px; }
  .divider { border-top: 1px dashed #000; margin: 4px 0; }
  .row { display: flex; justify-content: space-between; }
  .item-name { flex: 1; }
  .item-right { text-align: right; white-space: nowrap; padding-left: 8px; }
  @media print {
    @page { margin: 0; size: 80mm auto; }
    body { padding: 2mm; }
  }
</style>
</head>
<body>
${lines.map(l => renderLineHTML(l)).join('\n')}
</body>
</html>`

  const win = window.open('', '_blank', 'width=320,height=600')
  if (!win) return
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => {
    win.print()
    win.close()
  }, 300)
}

function renderLineHTML(line: ReceiptLine): string {
  const cls = [
    line.align === 'center' ? 'center' : line.align === 'right' ? 'right' : '',
    line.bold ? 'bold' : '',
    line.size === 'large' ? 'large' : line.size === 'small' ? 'small' : '',
  ]
    .filter(Boolean)
    .join(' ')

  if (line.type === 'divider') return '<div class="divider"></div>'
  if (line.type === 'item' && line.left && line.right) {
    return `<div class="row"><span class="item-name">${esc(line.left)}</span><span class="item-right">${esc(line.right)}</span></div>`
  }
  if (line.type === 'total' && line.left && line.right) {
    return `<div class="row bold"><span class="item-name">${esc(line.left)}</span><span class="item-right">${esc(line.right)}</span></div>`
  }
  return `<div class="${cls}">${esc(line.text ?? '')}</div>`
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ── ESC/POS commands ──────────────────────────────────────────────────────────

const ESC = 0x1b
const GS = 0x1d

function escPos(data: ReceiptData): Uint8Array {
  const buf: number[] = []

  const push = (...bytes: number[]) => buf.push(...bytes)
  const text = (s: string) => {
    for (const c of s) buf.push(c.charCodeAt(0) & 0xff)
  }
  const nl = () => buf.push(0x0a)
  const bold = (on: boolean) => push(ESC, 0x45, on ? 1 : 0)
  const align = (a: 'left' | 'center' | 'right') =>
    push(ESC, 0x61, a === 'left' ? 0 : a === 'center' ? 1 : 2)
  const dblHeight = (on: boolean) => push(GS, 0x21, on ? 0x10 : 0x00)
  const cut = () => push(GS, 0x56, 0x42, 0x00)
  const init = () => push(ESC, 0x40)

  // Initialize
  init()

  // Header
  align('center')
  bold(true)
  dblHeight(true)
  text(data.storeName.substring(0, 24))
  nl()
  dblHeight(false)
  bold(false)

  if (data.storeAddress) {
    text(data.storeAddress.substring(0, 48))
    nl()
  }
  if (data.storePhone) {
    text(data.storePhone)
    nl()
  }
  if (data.taxId) {
    text(`Tax ID: ${data.taxId}`)
    nl()
  }

  // Divider
  align('left')
  text('-'.repeat(32))
  nl()

  // Order info
  text(`No: ${data.orderNumber}`)
  nl()
  text(`${data.date}`)
  nl()
  if (data.cashier) {
    text(`Kasir: ${data.cashier}`)
    nl()
  }
  if (data.customerName) {
    text(`Pelanggan: ${data.customerName}`)
    nl()
  }

  text('-'.repeat(32))
  nl()

  // Items
  for (const item of data.items) {
    const name = item.name.substring(0, 20)
    text(name)
    nl()
    const qtyPrice = `  ${item.qty} x ${fmt(item.price, data.currency)}`
    const subtotal = fmt(item.subtotal, data.currency)
    const spaces = Math.max(1, 32 - qtyPrice.length - subtotal.length)
    text(qtyPrice + ' '.repeat(spaces) + subtotal)
    nl()
  }

  text('-'.repeat(32))
  nl()

  // Totals
  const totals: [string, string][] = [['Subtotal', fmt(data.subtotal, data.currency)]]
  if (data.discountAmt && data.discountAmt > 0)
    totals.push(['Diskon', `-${fmt(data.discountAmt, data.currency)}`])
  if (data.taxAmt && data.taxAmt > 0) totals.push(['Pajak', fmt(data.taxAmt, data.currency)])

  for (const [label, value] of totals) {
    const spaces = Math.max(1, 32 - label.length - value.length)
    text(label + ' '.repeat(spaces) + value)
    nl()
  }

  // Grand total
  bold(true)
  dblHeight(true)
  align('right')
  text(`TOTAL: ${fmt(data.total, data.currency)}`)
  nl()
  dblHeight(false)
  bold(false)
  align('left')

  if (data.paid) {
    const paidLine = `Bayar: ${fmt(data.paid, data.currency)}`
    const changeLine = `Kembali: ${fmt(data.change ?? 0, data.currency)}`
    text(paidLine)
    nl()
    text(changeLine)
    nl()
  }

  if (data.paymentMethod) {
    text(`Metode: ${data.paymentMethod}`)
    nl()
  }
  if (data.points) {
    text(`Poin: +${data.points}`)
    nl()
  }

  text('-'.repeat(32))
  nl()

  // Footer
  align('center')
  if (data.orderNote) {
    text(`Catatan: ${data.orderNote.substring(0, 46)}`)
    nl()
  }
  if (data.receiptNote) {
    text(data.receiptNote.substring(0, 48))
    nl()
  }
  text('Terima kasih!')
  nl()
  nl()
  nl()
  nl()

  // Cut paper
  cut()

  return new Uint8Array(buf)
}

// ── Web Serial API (thermal printer via USB-Serial / Bluetooth COM port) ───────

export async function printReceiptSerial(
  data: ReceiptData,
): Promise<{ ok: boolean; error?: string }> {
  if (!('serial' in navigator)) {
    return { ok: false, error: 'Web Serial API not supported. Use Chrome/Edge on desktop.' }
  }
  try {
    const port = await (navigator as any).serial.requestPort()
    await port.open({ baudRate: 9600 })
    const writer = port.writable.getWriter()
    await writer.write(escPos(data))
    writer.releaseLock()
    await port.close()
    return { ok: true }
  } catch (e: any) {
    if (e.name === 'NotFoundError') return { ok: false, error: 'No printer selected.' }
    return { ok: false, error: e.message ?? 'Print failed' }
  }
}

// ── Check Serial API availability ─────────────────────────────────────────────

export function isSerialAvailable(): boolean {
  return typeof window !== 'undefined' && 'serial' in navigator
}

// ── Build receipt lines (shared by browser + ESC/POS) ─────────────────────────

export function buildReceiptLines(data: ReceiptData): ReceiptLine[] {
  const lines: ReceiptLine[] = []

  lines.push({ type: 'text', text: data.storeName, align: 'center', bold: true, size: 'large' })
  if (data.storeAddress)
    lines.push({ type: 'text', text: data.storeAddress, align: 'center', size: 'small' })
  if (data.storePhone)
    lines.push({ type: 'text', text: data.storePhone, align: 'center', size: 'small' })
  if (data.taxId)
    lines.push({ type: 'text', text: `Tax ID: ${data.taxId}`, align: 'center', size: 'small' })
  lines.push({ type: 'divider' })
  lines.push({ type: 'item', left: `No: ${data.orderNumber}`, right: data.date })
  if (data.cashier) lines.push({ type: 'text', text: `Cashier: ${data.cashier}`, size: 'small' })
  if (data.customerName)
    lines.push({ type: 'text', text: `Customer: ${data.customerName}`, size: 'small' })
  lines.push({ type: 'divider' })

  for (const item of data.items) {
    lines.push({ type: 'item', left: item.name, right: fmt(item.subtotal, data.currency) })
    lines.push({
      type: 'text',
      text: `  ${item.qty} × ${fmt(item.price, data.currency)}`,
      size: 'small',
    })
  }

  lines.push({ type: 'divider' })
  lines.push({ type: 'item', left: 'Subtotal', right: fmt(data.subtotal, data.currency) })
  if (data.discountAmt && data.discountAmt > 0)
    lines.push({
      type: 'item',
      left: 'Discount',
      right: `-${fmt(data.discountAmt, data.currency)}`,
    })
  if (data.taxAmt && data.taxAmt > 0)
    lines.push({ type: 'item', left: 'Tax', right: fmt(data.taxAmt, data.currency) })
  lines.push({ type: 'total', left: 'TOTAL', right: fmt(data.total, data.currency), bold: true })

  if (data.paid) {
    lines.push({ type: 'item', left: 'Paid', right: fmt(data.paid, data.currency) })
    lines.push({ type: 'item', left: 'Change', right: fmt(data.change ?? 0, data.currency) })
  }
  if (data.paymentMethod)
    lines.push({ type: 'text', text: `Payment: ${data.paymentMethod}`, size: 'small' })
  if (data.points)
    lines.push({ type: 'text', text: `Points earned: +${data.points}`, size: 'small' })

  lines.push({ type: 'divider' })
  if (data.orderNote) lines.push({ type: 'text', text: `Note: ${data.orderNote}`, size: 'small' })
  if (data.receiptNote)
    lines.push({ type: 'text', text: data.receiptNote, align: 'center', size: 'small' })
  lines.push({ type: 'text', text: 'Thank you!', align: 'center', bold: true })

  return lines
}
