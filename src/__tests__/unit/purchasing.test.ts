import { describe, it, expect } from 'vitest'

// ── Types ─────────────────────────────────────────────────────────────────────

type POStatus = 'DRAFT' | 'SENT' | 'PARTIAL' | 'RECEIVED' | 'CANCELLED'

interface POLine {
  id: string
  productId: string
  productName: string
  qty: number
  unitCost: number
  receivedQty: number
  subtotal: number
}

interface SupplierPO {
  id: string
  supplierId: string
  status: POStatus
  total: number
}

interface StockUpdate {
  productId: string
  qty: number
}

// ── Pure business logic ───────────────────────────────────────────────────────

/** Calculate the total for a PO given lines and a tax rate */
function calcPOTotal(
  lines: POLine[],
  taxRate: number,
): { subtotal: number; taxAmt: number; total: number } {
  const subtotal = lines.reduce((s, l) => s + l.qty * l.unitCost, 0)
  const taxAmt = Math.round(subtotal * taxRate)
  return { subtotal, taxAmt, total: subtotal + taxAmt }
}

/** Determine stock deltas from a goods receipt */
function calcStockUpdates(
  receiveLines: { lineId: string; productId: string; qty: number }[],
): StockUpdate[] {
  return receiveLines.map(r => ({ productId: r.productId, qty: r.qty }))
}

/** Determine new PO status after a receipt */
function calcPOStatusAfterReceipt(lines: POLine[]): POStatus {
  if (lines.length === 0) return 'SENT'
  const totalOrdered = lines.reduce((s, l) => s + l.qty, 0)
  const totalReceived = lines.reduce((s, l) => s + l.receivedQty, 0)
  if (totalReceived === 0) return 'SENT'
  if (lines.every(l => l.receivedQty >= l.qty)) return 'RECEIVED'
  return 'PARTIAL'
}

/** Calculate supplier balance: sum of totals for non-RECEIVED, non-CANCELLED POs */
function calcSupplierBalance(supplierId: string, orders: SupplierPO[]): number {
  return orders
    .filter(o => o.supplierId === supplierId && o.status !== 'RECEIVED' && o.status !== 'CANCELLED')
    .reduce((s, o) => s + o.total, 0)
}

/** Apply received quantities to PO lines (immutable) */
function applyReceiptToLines(
  lines: POLine[],
  receiveLines: { id: string; receivedQty: number }[],
): POLine[] {
  return lines.map(line => {
    const incoming = receiveLines.find(r => r.id === line.id)
    if (!incoming) return line
    return { ...line, receivedQty: line.receivedQty + incoming.receivedQty }
  })
}

// ── Tests: PO total calculation ───────────────────────────────────────────────

describe('PO total calculation', () => {
  it('calculates subtotal, tax, and total correctly', () => {
    const lines: POLine[] = [
      {
        id: 'l1',
        productId: 'p1',
        productName: 'A',
        qty: 10,
        unitCost: 10000,
        receivedQty: 0,
        subtotal: 100000,
      },
      {
        id: 'l2',
        productId: 'p2',
        productName: 'B',
        qty: 5,
        unitCost: 20000,
        receivedQty: 0,
        subtotal: 100000,
      },
    ]
    const result = calcPOTotal(lines, 0.11)
    expect(result.subtotal).toBe(200000)
    expect(result.taxAmt).toBe(22000)
    expect(result.total).toBe(222000)
  })

  it('returns zero total for empty lines', () => {
    const result = calcPOTotal([], 0.11)
    expect(result.subtotal).toBe(0)
    expect(result.taxAmt).toBe(0)
    expect(result.total).toBe(0)
  })

  it('calculates total with zero tax rate', () => {
    const lines: POLine[] = [
      {
        id: 'l1',
        productId: 'p1',
        productName: 'A',
        qty: 3,
        unitCost: 50000,
        receivedQty: 0,
        subtotal: 150000,
      },
    ]
    const result = calcPOTotal(lines, 0)
    expect(result.taxAmt).toBe(0)
    expect(result.total).toBe(150000)
  })
})

// ── Tests: Goods receipt stock update ────────────────────────────────────────

describe('Goods receipt stock update logic', () => {
  it('produces one stock update per received line', () => {
    const updates = calcStockUpdates([
      { lineId: 'l1', productId: 'p1', qty: 5 },
      { lineId: 'l2', productId: 'p2', qty: 3 },
    ])
    expect(updates).toHaveLength(2)
    expect(updates[0]).toEqual({ productId: 'p1', qty: 5 })
    expect(updates[1]).toEqual({ productId: 'p2', qty: 3 })
  })

  it('returns empty array when no lines received', () => {
    expect(calcStockUpdates([])).toHaveLength(0)
  })

  it('applies received qty to PO lines correctly', () => {
    const lines: POLine[] = [
      {
        id: 'l1',
        productId: 'p1',
        productName: 'A',
        qty: 10,
        unitCost: 5000,
        receivedQty: 0,
        subtotal: 50000,
      },
      {
        id: 'l2',
        productId: 'p2',
        productName: 'B',
        qty: 4,
        unitCost: 10000,
        receivedQty: 0,
        subtotal: 40000,
      },
    ]
    const updated = applyReceiptToLines(lines, [{ id: 'l1', receivedQty: 6 }])
    expect(updated[0].receivedQty).toBe(6)
    expect(updated[1].receivedQty).toBe(0) // unchanged
  })

  it('accumulates receivedQty on a second receipt', () => {
    const lines: POLine[] = [
      {
        id: 'l1',
        productId: 'p1',
        productName: 'A',
        qty: 10,
        unitCost: 5000,
        receivedQty: 4,
        subtotal: 50000,
      },
    ]
    const updated = applyReceiptToLines(lines, [{ id: 'l1', receivedQty: 4 }])
    expect(updated[0].receivedQty).toBe(8)
  })
})

// ── Tests: Partial receipt handling ──────────────────────────────────────────

describe('Partial receipt handling', () => {
  it('status is PARTIAL when some but not all qty received', () => {
    const lines: POLine[] = [
      {
        id: 'l1',
        productId: 'p1',
        productName: 'A',
        qty: 10,
        unitCost: 1000,
        receivedQty: 5,
        subtotal: 10000,
      },
      {
        id: 'l2',
        productId: 'p2',
        productName: 'B',
        qty: 5,
        unitCost: 2000,
        receivedQty: 0,
        subtotal: 10000,
      },
    ]
    expect(calcPOStatusAfterReceipt(lines)).toBe('PARTIAL')
  })

  it('status is RECEIVED when all lines fully received', () => {
    const lines: POLine[] = [
      {
        id: 'l1',
        productId: 'p1',
        productName: 'A',
        qty: 10,
        unitCost: 1000,
        receivedQty: 10,
        subtotal: 10000,
      },
      {
        id: 'l2',
        productId: 'p2',
        productName: 'B',
        qty: 5,
        unitCost: 2000,
        receivedQty: 5,
        subtotal: 10000,
      },
    ]
    expect(calcPOStatusAfterReceipt(lines)).toBe('RECEIVED')
  })

  it('status stays SENT when nothing received yet', () => {
    const lines: POLine[] = [
      {
        id: 'l1',
        productId: 'p1',
        productName: 'A',
        qty: 10,
        unitCost: 1000,
        receivedQty: 0,
        subtotal: 10000,
      },
    ]
    expect(calcPOStatusAfterReceipt(lines)).toBe('SENT')
  })
})

// ── Tests: Supplier balance calculation ──────────────────────────────────────

describe('Supplier balance calculation', () => {
  const orders: SupplierPO[] = [
    { id: 'po1', supplierId: 's1', status: 'DRAFT', total: 100000 },
    { id: 'po2', supplierId: 's1', status: 'SENT', total: 200000 },
    { id: 'po3', supplierId: 's1', status: 'PARTIAL', total: 150000 },
    { id: 'po4', supplierId: 's1', status: 'RECEIVED', total: 300000 }, // paid — excluded
    { id: 'po5', supplierId: 's1', status: 'CANCELLED', total: 50000 }, // cancelled — excluded
    { id: 'po6', supplierId: 's2', status: 'SENT', total: 999999 }, // different supplier
  ]

  it('sums totals for DRAFT, SENT, PARTIAL POs', () => {
    expect(calcSupplierBalance('s1', orders)).toBe(450000)
  })

  it('excludes RECEIVED and CANCELLED orders', () => {
    const balance = calcSupplierBalance('s1', orders)
    // 100000 + 200000 + 150000 = 450000 (not 300000 or 50000)
    expect(balance).not.toContain?.(300000)
    expect(balance).toBe(450000)
  })

  it('returns 0 when supplier has no unpaid POs', () => {
    expect(
      calcSupplierBalance('s1', [
        { id: 'po1', supplierId: 's1', status: 'RECEIVED', total: 100000 },
      ]),
    ).toBe(0)
  })

  it('returns 0 for unknown supplier', () => {
    expect(calcSupplierBalance('unknown', orders)).toBe(0)
  })

  it('does not include another supplier balance', () => {
    const s1Balance = calcSupplierBalance('s1', orders)
    const s2Balance = calcSupplierBalance('s2', orders)
    expect(s1Balance).toBe(450000)
    expect(s2Balance).toBe(999999)
  })
})
