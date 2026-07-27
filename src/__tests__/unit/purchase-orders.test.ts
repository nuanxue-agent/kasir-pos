import { describe, it, expect } from 'vitest'

// ── Purchase Order business logic ────────────────────────────────────────────

type POStatus = 'DRAFT' | 'SENT' | 'CONFIRMED' | 'RECEIVED' | 'CANCELLED'
type POLineStatus = 'PENDING' | 'PARTIAL' | 'RECEIVED'

interface POLine {
  id: string
  productId: string
  productName: string
  qty: number
  unitCost: number
  receivedQty: number
  subtotal: number
}

interface PurchaseOrder {
  id: string
  supplierId: string
  status: POStatus
  lines: POLine[]
  subtotal: number
  taxAmt: number
  total: number
}

// ── Pure functions ────────────────────────────────────────────────────────────

function calcPOLineSubtotal(qty: number, unitCost: number): number {
  return qty * unitCost
}

function calcPOSubtotal(lines: POLine[]): number {
  return lines.reduce((sum, l) => sum + l.subtotal, 0)
}

function calcPOTax(subtotal: number, taxRate: number): number {
  return Math.round(subtotal * taxRate)
}

function calcPOTotal(subtotal: number, taxAmt: number): number {
  return subtotal + taxAmt
}

function getPOLineStatus(line: POLine): POLineStatus {
  if (line.receivedQty === 0) return 'PENDING'
  if (line.receivedQty >= line.qty) return 'RECEIVED'
  return 'PARTIAL'
}

function canReceiveGoods(status: POStatus): boolean {
  return status === 'CONFIRMED' || status === 'SENT'
}

function canCancelPO(status: POStatus): boolean {
  return status === 'DRAFT' || status === 'SENT'
}

function canEditPO(status: POStatus): boolean {
  return status === 'DRAFT'
}

function getPOReceiptProgress(lines: POLine[]): number {
  if (lines.length === 0) return 0
  const totalOrdered = lines.reduce((s, l) => s + l.qty, 0)
  const totalReceived = lines.reduce((s, l) => s + l.receivedQty, 0)
  return Math.min(100, Math.round((totalReceived / totalOrdered) * 100))
}

function validatePOLine(line: Partial<POLine>): string | null {
  if (!line.productId) return 'Produk harus dipilih'
  if (!line.qty || line.qty <= 0) return 'Jumlah harus lebih dari 0'
  if (line.unitCost == null || line.unitCost < 0) return 'Harga beli tidak boleh negatif'
  return null
}

function validateSupplier(data: any): string | null {
  if (!data.name || data.name.trim().length < 2) return 'Nama supplier minimal 2 karakter'
  if (data.email && !data.email.includes('@')) return 'Email tidak valid'
  if (data.phone && !/^[\d\s+\-()]+$/.test(data.phone)) return 'Nomor telepon tidak valid'
  return null
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PO line calculations', () => {
  it('calculates line subtotal', () => {
    expect(calcPOLineSubtotal(10, 15000)).toBe(150000)
  })
  it('calculates subtotal for zero qty', () => {
    expect(calcPOLineSubtotal(0, 15000)).toBe(0)
  })
  it('calculates PO subtotal from lines', () => {
    const lines: POLine[] = [
      { id: '1', productId: 'p1', productName: 'A', qty: 5, unitCost: 10000, receivedQty: 0, subtotal: 50000 },
      { id: '2', productId: 'p2', productName: 'B', qty: 3, unitCost: 20000, receivedQty: 0, subtotal: 60000 },
    ]
    expect(calcPOSubtotal(lines)).toBe(110000)
  })
  it('returns 0 for empty lines', () => {
    expect(calcPOSubtotal([])).toBe(0)
  })
  it('calculates PO tax', () => {
    expect(calcPOTax(100000, 0.11)).toBe(11000)
  })
  it('calculates PO total', () => {
    expect(calcPOTotal(100000, 11000)).toBe(111000)
  })
})

describe('PO line status', () => {
  const baseLine = (qty: number, receivedQty: number): POLine => ({
    id: '1', productId: 'p1', productName: 'X', qty, unitCost: 1000, receivedQty, subtotal: qty * 1000,
  })

  it('PENDING when nothing received', () => {
    expect(getPOLineStatus(baseLine(10, 0))).toBe('PENDING')
  })
  it('PARTIAL when some received', () => {
    expect(getPOLineStatus(baseLine(10, 5))).toBe('PARTIAL')
  })
  it('RECEIVED when fully received', () => {
    expect(getPOLineStatus(baseLine(10, 10))).toBe('RECEIVED')
  })
  it('RECEIVED when over-received', () => {
    expect(getPOLineStatus(baseLine(10, 12))).toBe('RECEIVED')
  })
})

describe('PO status transitions', () => {
  it('can receive goods on CONFIRMED', () => {
    expect(canReceiveGoods('CONFIRMED')).toBe(true)
  })
  it('can receive goods on SENT', () => {
    expect(canReceiveGoods('SENT')).toBe(true)
  })
  it('cannot receive goods on DRAFT', () => {
    expect(canReceiveGoods('DRAFT')).toBe(false)
  })
  it('cannot receive goods on RECEIVED', () => {
    expect(canReceiveGoods('RECEIVED')).toBe(false)
  })
  it('cannot receive goods on CANCELLED', () => {
    expect(canReceiveGoods('CANCELLED')).toBe(false)
  })

  it('can cancel DRAFT', () => expect(canCancelPO('DRAFT')).toBe(true))
  it('can cancel SENT', () => expect(canCancelPO('SENT')).toBe(true))
  it('cannot cancel CONFIRMED', () => expect(canCancelPO('CONFIRMED')).toBe(false))
  it('cannot cancel RECEIVED', () => expect(canCancelPO('RECEIVED')).toBe(false))

  it('can edit only DRAFT', () => {
    expect(canEditPO('DRAFT')).toBe(true)
    expect(canEditPO('SENT')).toBe(false)
    expect(canEditPO('CONFIRMED')).toBe(false)
    expect(canEditPO('RECEIVED')).toBe(false)
  })
})

describe('PO receipt progress', () => {
  it('0% when nothing received', () => {
    const lines: POLine[] = [
      { id: '1', productId: 'p1', productName: 'A', qty: 10, unitCost: 1000, receivedQty: 0, subtotal: 10000 },
    ]
    expect(getPOReceiptProgress(lines)).toBe(0)
  })
  it('50% when half received', () => {
    const lines: POLine[] = [
      { id: '1', productId: 'p1', productName: 'A', qty: 10, unitCost: 1000, receivedQty: 5, subtotal: 10000 },
    ]
    expect(getPOReceiptProgress(lines)).toBe(50)
  })
  it('100% when fully received', () => {
    const lines: POLine[] = [
      { id: '1', productId: 'p1', productName: 'A', qty: 10, unitCost: 1000, receivedQty: 10, subtotal: 10000 },
    ]
    expect(getPOReceiptProgress(lines)).toBe(100)
  })
  it('capped at 100% when over-received', () => {
    const lines: POLine[] = [
      { id: '1', productId: 'p1', productName: 'A', qty: 10, unitCost: 1000, receivedQty: 15, subtotal: 10000 },
    ]
    expect(getPOReceiptProgress(lines)).toBe(100)
  })
  it('0% for empty lines', () => {
    expect(getPOReceiptProgress([])).toBe(0)
  })
  it('averages across multiple lines', () => {
    const lines: POLine[] = [
      { id: '1', productId: 'p1', productName: 'A', qty: 10, unitCost: 1000, receivedQty: 10, subtotal: 10000 },
      { id: '2', productId: 'p2', productName: 'B', qty: 10, unitCost: 1000, receivedQty: 0, subtotal: 10000 },
    ]
    expect(getPOReceiptProgress(lines)).toBe(50)
  })
})

describe('PO line validation', () => {
  it('accepts valid line', () => {
    expect(validatePOLine({ productId: 'p1', qty: 5, unitCost: 10000 })).toBeNull()
  })
  it('rejects missing product', () => {
    expect(validatePOLine({ qty: 5, unitCost: 10000 })).toBe('Produk harus dipilih')
  })
  it('rejects zero qty', () => {
    expect(validatePOLine({ productId: 'p1', qty: 0, unitCost: 10000 })).toBe('Jumlah harus lebih dari 0')
  })
  it('rejects negative qty', () => {
    expect(validatePOLine({ productId: 'p1', qty: -1, unitCost: 10000 })).toBe('Jumlah harus lebih dari 0')
  })
  it('accepts zero unit cost (free items)', () => {
    expect(validatePOLine({ productId: 'p1', qty: 5, unitCost: 0 })).toBeNull()
  })
  it('rejects negative unit cost', () => {
    expect(validatePOLine({ productId: 'p1', qty: 5, unitCost: -100 })).toBe('Harga beli tidak boleh negatif')
  })
})

describe('Supplier validation', () => {
  it('accepts valid supplier', () => {
    expect(validateSupplier({ name: 'PT Sumber Makmur', email: 'info@sumber.com', phone: '021-12345' })).toBeNull()
  })
  it('accepts supplier with no email/phone', () => {
    expect(validateSupplier({ name: 'PT Sumber' })).toBeNull()
  })
  it('rejects short name', () => {
    expect(validateSupplier({ name: 'A' })).toBe('Nama supplier minimal 2 karakter')
  })
  it('rejects invalid email', () => {
    expect(validateSupplier({ name: 'PT Sumber', email: 'notanemail' })).toBe('Email tidak valid')
  })
  it('accepts phone with country code', () => {
    expect(validateSupplier({ name: 'PT Sumber', phone: '+62 812 3456 7890' })).toBeNull()
  })
})

// ── Receive workflow helpers ──────────────────────────────────────────────────

interface ReceiveLine {
  id: string
  receivedQty: number
}

function validateReceiveLines(lines: ReceiveLine[], poLines: POLine[]): string | null {
  if (!lines || lines.length === 0) return 'lines required'
  for (const rl of lines) {
    const poLine = poLines.find(l => l.id === rl.id)
    if (!poLine) return `Line ${rl.id} tidak ditemukan`
    if (rl.receivedQty <= 0) return 'receivedQty harus lebih dari 0'
    const remaining = poLine.qty - poLine.receivedQty
    if (rl.receivedQty > remaining) return `Melebihi sisa qty pada line ${rl.id}`
  }
  return null
}

function applyReceiveLines(poLines: POLine[], receiveLines: ReceiveLine[]): POLine[] {
  return poLines.map(line => {
    const incoming = receiveLines.find(r => r.id === line.id)
    if (!incoming) return line
    return { ...line, receivedQty: line.receivedQty + incoming.receivedQty }
  })
}

function calcStockDelta(receiveLines: ReceiveLine[]): number {
  return receiveLines.reduce((s, r) => s + r.receivedQty, 0)
}

// ── Duplicate PO helper ───────────────────────────────────────────────────────

function duplicatePO(po: PurchaseOrder): PurchaseOrder {
  return {
    ...po,
    id: `${po.id}_copy`,
    status: 'DRAFT',
    lines: po.lines.map(l => ({ ...l, receivedQty: 0 })),
  }
}

// ── Supplier metrics helper ───────────────────────────────────────────────────

interface SupplierOrder {
  status: POStatus
  total: number
  orderDate: string
  updatedAt: string
}

function calcSupplierMetrics(orders: SupplierOrder[]) {
  const totalOrders = orders.length
  const totalValue = orders.reduce((s, o) => s + o.total, 0)
  const received = orders.filter(o => o.status === 'RECEIVED')
  const avgDeliveryDays = received.length === 0 ? null
    : Math.round(
        received.reduce((s, o) => {
          const days = (new Date(o.updatedAt).getTime() - new Date(o.orderDate).getTime()) / (1000 * 60 * 60 * 24)
          return s + days
        }, 0) / received.length
      )
  return { totalOrders, totalValue, avgDeliveryDays, receivedCount: received.length }
}

// ── Receive workflow tests ────────────────────────────────────────────────────

describe('Receive workflow validation', () => {
  const baseLines: POLine[] = [
    { id: 'l1', productId: 'p1', productName: 'Item A', qty: 10, unitCost: 5000, receivedQty: 0, subtotal: 50000 },
    { id: 'l2', productId: 'p2', productName: 'Item B', qty: 5,  unitCost: 20000, receivedQty: 0, subtotal: 100000 },
  ]

  it('accepts valid receive lines', () => {
    expect(validateReceiveLines([{ id: 'l1', receivedQty: 5 }], baseLines)).toBeNull()
  })
  it('rejects empty lines array', () => {
    expect(validateReceiveLines([], baseLines)).toBe('lines required')
  })
  it('rejects unknown line id', () => {
    expect(validateReceiveLines([{ id: 'unknown', receivedQty: 1 }], baseLines)).toBe('Line unknown tidak ditemukan')
  })
  it('rejects zero receivedQty', () => {
    expect(validateReceiveLines([{ id: 'l1', receivedQty: 0 }], baseLines)).toBe('receivedQty harus lebih dari 0')
  })
  it('rejects quantity exceeding remaining', () => {
    expect(validateReceiveLines([{ id: 'l1', receivedQty: 11 }], baseLines)).toMatch(/Melebihi sisa qty/)
  })
  it('applies receive lines to PO lines correctly', () => {
    const updated = applyReceiveLines(baseLines, [{ id: 'l1', receivedQty: 5 }])
    expect(updated[0].receivedQty).toBe(5)
    expect(updated[1].receivedQty).toBe(0)
  })
  it('calculates total stock delta from receive lines', () => {
    expect(calcStockDelta([{ id: 'l1', receivedQty: 5 }, { id: 'l2', receivedQty: 3 }])).toBe(8)
  })
})

// ── Duplicate PO tests ────────────────────────────────────────────────────────

describe('Duplicate PO', () => {
  const sourcePO: PurchaseOrder = {
    id: 'po1',
    supplierId: 's1',
    status: 'RECEIVED',
    subtotal: 150000,
    taxAmt: 15000,
    total: 165000,
    lines: [
      { id: 'l1', productId: 'p1', productName: 'Item A', qty: 10, unitCost: 5000, receivedQty: 10, subtotal: 50000 },
      { id: 'l2', productId: 'p2', productName: 'Item B', qty: 5,  unitCost: 20000, receivedQty: 5,  subtotal: 100000 },
    ],
  }

  it('creates a DRAFT copy', () => {
    expect(duplicatePO(sourcePO).status).toBe('DRAFT')
  })
  it('resets receivedQty to 0 on all lines', () => {
    const copy = duplicatePO(sourcePO)
    expect(copy.lines.every(l => l.receivedQty === 0)).toBe(true)
  })
  it('preserves supplier, lines qty, and totals', () => {
    const copy = duplicatePO(sourcePO)
    expect(copy.supplierId).toBe('s1')
    expect(copy.lines[0].qty).toBe(10)
    expect(copy.total).toBe(165000)
  })
})

// ── Supplier metrics tests ────────────────────────────────────────────────────

describe('Supplier performance metrics', () => {
  const orders: SupplierOrder[] = [
    { status: 'RECEIVED', total: 200000, orderDate: '2024-01-01', updatedAt: '2024-01-05' }, // 4 days
    { status: 'RECEIVED', total: 300000, orderDate: '2024-02-01', updatedAt: '2024-02-09' }, // 8 days
    { status: 'DRAFT',    total: 100000, orderDate: '2024-03-01', updatedAt: '2024-03-01' },
  ]

  it('counts total orders including all statuses', () => {
    expect(calcSupplierMetrics(orders).totalOrders).toBe(3)
  })
  it('sums total value across all orders', () => {
    expect(calcSupplierMetrics(orders).totalValue).toBe(600000)
  })
  it('calculates avg delivery days from RECEIVED orders only', () => {
    // avg of 4 and 8 = 6
    expect(calcSupplierMetrics(orders).avgDeliveryDays).toBe(6)
  })
  it('returns null avgDeliveryDays when no RECEIVED orders', () => {
    const draftOnly: SupplierOrder[] = [
      { status: 'DRAFT', total: 50000, orderDate: '2024-01-01', updatedAt: '2024-01-01' },
    ]
    expect(calcSupplierMetrics(draftOnly).avgDeliveryDays).toBeNull()
  })
  it('returns 0 totalOrders and 0 totalValue for empty history', () => {
    const m = calcSupplierMetrics([])
    expect(m.totalOrders).toBe(0)
    expect(m.totalValue).toBe(0)
  })
})
