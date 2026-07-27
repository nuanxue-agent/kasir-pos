import { describe, it, expect } from 'vitest'

// ── Pure business-logic functions mirroring the franchise module ──────────────

/** Calculate royalty fee from revenue and rate */
function calcRoyaltyFee(revenue: number, royaltyRate: number): number {
  if (royaltyRate < 0 || royaltyRate > 100) throw new RangeError('royaltyRate must be 0–100')
  return revenue * (royaltyRate / 100)
}

/** Validate a stock transfer request */
function validateStockTransfer(req: {
  fromStoreId: string
  toStoreId: string
  productId: string
  qty: number
  availableStock: number
}): string | null {
  if (!req.fromStoreId) return 'fromStoreId is required'
  if (!req.toStoreId) return 'toStoreId is required'
  if (!req.productId) return 'productId is required'
  if (req.fromStoreId === req.toStoreId) return 'fromStoreId and toStoreId must differ'
  if (!Number.isInteger(req.qty) || req.qty <= 0) return 'qty must be a positive integer'
  if (req.availableStock < req.qty) return `Insufficient stock (available: ${req.availableStock})`
  return null
}

/** Aggregate consolidated revenue from child store data */
function aggregateConsolidated(
  stores: Array<{
    revenue: number
    orders: number
    expenses: number
  }>,
): { totalRevenue: number; totalOrders: number; totalExpenses: number; netProfit: number } {
  const totalRevenue = stores.reduce((s, r) => s + r.revenue, 0)
  const totalOrders = stores.reduce((s, r) => s + r.orders, 0)
  const totalExpenses = stores.reduce((s, r) => s + r.expenses, 0)
  return { totalRevenue, totalOrders, totalExpenses, netProfit: totalRevenue - totalExpenses }
}

/** Check if a contract is expired or expiring within N days */
function contractStatus(
  contractEnd: string | null,
  warningDays = 30,
): 'none' | 'active' | 'expiring_soon' | 'expired' {
  if (!contractEnd) return 'none'
  const diff = new Date(contractEnd).getTime() - Date.now()
  if (diff < 0) return 'expired'
  if (diff < warningDays * 24 * 60 * 60 * 1000) return 'expiring_soon'
  return 'active'
}

// ── Royalty fee calculation ───────────────────────────────────────────────────

describe('Royalty fee calculation', () => {
  it('calculates 5% royalty correctly', () => {
    expect(calcRoyaltyFee(1_000_000, 5)).toBe(50_000)
  })

  it('calculates 0% royalty as zero', () => {
    expect(calcRoyaltyFee(500_000, 0)).toBe(0)
  })

  it('calculates 100% royalty as full revenue', () => {
    expect(calcRoyaltyFee(200_000, 100)).toBe(200_000)
  })

  it('throws for negative royalty rate', () => {
    expect(() => calcRoyaltyFee(100_000, -1)).toThrow(RangeError)
  })

  it('throws for royalty rate above 100', () => {
    expect(() => calcRoyaltyFee(100_000, 101)).toThrow(RangeError)
  })
})

// ── Stock transfer validation ─────────────────────────────────────────────────

describe('Stock transfer validation', () => {
  const base = {
    fromStoreId: 'store-a',
    toStoreId: 'store-b',
    productId: 'prod-1',
    qty: 10,
    availableStock: 50,
  }

  it('passes for valid transfer request', () => {
    expect(validateStockTransfer(base)).toBeNull()
  })

  it('rejects when fromStoreId equals toStoreId', () => {
    expect(validateStockTransfer({ ...base, toStoreId: 'store-a' })).toMatch(/must differ/)
  })

  it('rejects when qty is 0', () => {
    expect(validateStockTransfer({ ...base, qty: 0 })).toMatch(/positive integer/)
  })

  it('rejects when qty exceeds available stock', () => {
    expect(validateStockTransfer({ ...base, qty: 60, availableStock: 50 })).toMatch(/Insufficient/)
  })
})

// ── Consolidated revenue aggregation ─────────────────────────────────────────

describe('Consolidated revenue aggregation', () => {
  it('sums revenue, orders, and expenses across stores', () => {
    const result = aggregateConsolidated([
      { revenue: 1_000_000, orders: 10, expenses: 200_000 },
      { revenue: 500_000, orders: 5, expenses: 100_000 },
      { revenue: 750_000, orders: 8, expenses: 150_000 },
    ])
    expect(result.totalRevenue).toBe(2_250_000)
    expect(result.totalOrders).toBe(23)
    expect(result.totalExpenses).toBe(450_000)
    expect(result.netProfit).toBe(1_800_000)
  })

  it('returns zeros for empty store list', () => {
    const result = aggregateConsolidated([])
    expect(result.totalRevenue).toBe(0)
    expect(result.netProfit).toBe(0)
  })
})

// ── Contract expiry detection ─────────────────────────────────────────────────

describe('Contract expiry detection', () => {
  it('returns "none" for null contract end', () => {
    expect(contractStatus(null)).toBe('none')
  })

  it('detects an expired contract', () => {
    expect(contractStatus('2020-01-01')).toBe('expired')
  })

  it('detects an active contract far in the future', () => {
    const future = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    expect(contractStatus(future)).toBe('active')
  })

  it('detects a contract expiring within warning window', () => {
    const soon = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    expect(contractStatus(soon, 30)).toBe('expiring_soon')
  })
})
