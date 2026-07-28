import { describe, it, expect } from 'vitest'

// ─── Types ────────────────────────────────────────────────────────────────────

type TransferType = 'STOCK' | 'CASH'
type TransferStatus = 'PENDING' | 'COMPLETED'

interface InterCompanyTransfer {
  id: string
  fromStoreId: string
  toStoreId: string
  type: TransferType
  amount: number
  productId?: string | null
  qty?: number | null
  status: TransferStatus
  createdAt: string
}

interface StoreConsolidated {
  storeId: string
  storeName: string
  revenue: number
  cogs: number
  grossProfit: number
  operatingExpenses: number
  netProfit: number
  intercompanyRevenue: number
  intercompanyCost: number
  minorityPct?: number
}

// ─── Pure business logic (mirrors API logic) ──────────────────────────────────

function eliminateIntercompany(stores: StoreConsolidated[]): {
  adjustedRevenue: number
  totalElimination: number
} {
  const totalElimination = stores.reduce((s, st) => s + st.intercompanyRevenue, 0)
  const adjustedRevenue = stores.reduce((s, st) => s + (st.revenue - st.intercompanyRevenue), 0)
  return { adjustedRevenue, totalElimination }
}

function calcConsolidated(stores: StoreConsolidated[]) {
  const revenue = stores.reduce((s, st) => s + st.revenue - st.intercompanyRevenue, 0)
  const cogs = stores.reduce((s, st) => s + st.cogs, 0)
  const grossProfit = revenue - cogs
  const operatingExpenses = stores.reduce((s, st) => s + st.operatingExpenses, 0)
  const netProfit = grossProfit - operatingExpenses
  return { revenue, cogs, grossProfit, operatingExpenses, netProfit }
}

function calcMinorityInterest(stores: StoreConsolidated[]): number {
  return stores.reduce((sum, st) => {
    const netProfit = st.grossProfit - st.operatingExpenses
    const minPct = st.minorityPct ?? 0
    return sum + netProfit * (minPct / 100)
  }, 0)
}

function normalizeCurrency(amount: number, fromRate: number, toRate: number): number {
  // Convert via base currency: amount_base = amount / fromRate; result = amount_base * toRate
  return (amount / fromRate) * toRate
}

function validateTransfer(t: Partial<InterCompanyTransfer>): string | null {
  if (!t.fromStoreId || !t.toStoreId) return 'fromStoreId and toStoreId are required'
  if (t.fromStoreId === t.toStoreId) return 'fromStoreId and toStoreId must differ'
  if (!t.type || !['STOCK', 'CASH'].includes(t.type)) return "type must be 'STOCK' or 'CASH'"
  if (t.amount === undefined || t.amount === null || t.amount <= 0) return 'amount must be positive'
  if (t.type === 'STOCK' && (!t.productId || !t.qty || t.qty <= 0))
    return 'STOCK transfers require productId and qty > 0'
  return null
}

function netConsolidatedRevenue(stores: StoreConsolidated[]): number {
  return stores.reduce((s, st) => s + st.revenue - st.intercompanyRevenue, 0)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

const storeA: StoreConsolidated = {
  storeId: 'store_a',
  storeName: 'Store A (Parent)',
  revenue: 10_000_000,
  cogs: 4_000_000,
  grossProfit: 6_000_000,
  operatingExpenses: 2_000_000,
  netProfit: 4_000_000,
  intercompanyRevenue: 500_000,
  intercompanyCost: 0,
  minorityPct: 0,
}

const storeB: StoreConsolidated = {
  storeId: 'store_b',
  storeName: 'Store B (Child 80%)',
  revenue: 6_000_000,
  cogs: 2_500_000,
  grossProfit: 3_500_000,
  operatingExpenses: 1_000_000,
  netProfit: 2_500_000,
  intercompanyRevenue: 0,
  intercompanyCost: 500_000,
  minorityPct: 20,
}

const storeC: StoreConsolidated = {
  storeId: 'store_c',
  storeName: 'Store C (Child 70%)',
  revenue: 4_000_000,
  cogs: 1_500_000,
  grossProfit: 2_500_000,
  operatingExpenses: 800_000,
  netProfit: 1_700_000,
  intercompanyRevenue: 200_000,
  intercompanyCost: 0,
  minorityPct: 30,
}

describe('Consolidation elimination logic', () => {
  it('removes intercompany revenue from consolidated total', () => {
    const { adjustedRevenue, totalElimination } = eliminateIntercompany([storeA, storeB])
    expect(totalElimination).toBe(500_000)
    // storeA adj: 10M - 500k = 9.5M, storeB adj: 6M - 0 = 6M
    expect(adjustedRevenue).toBe(15_500_000)
  })

  it('eliminates IC revenue from both stores correctly when both have IC', () => {
    const { totalElimination } = eliminateIntercompany([storeA, storeC])
    expect(totalElimination).toBe(700_000) // 500k + 200k
  })

  it('consolidated revenue equals sum minus all IC revenue', () => {
    const result = calcConsolidated([storeA, storeB, storeC])
    const expectedRevenue = (10_000_000 - 500_000) + (6_000_000 - 0) + (4_000_000 - 200_000)
    expect(result.revenue).toBe(expectedRevenue)
  })

  it('gross profit is consolidated revenue minus total COGS', () => {
    const result = calcConsolidated([storeA, storeB])
    expect(result.grossProfit).toBe(result.revenue - result.cogs)
  })
})

describe('Inter-company transfer validation', () => {
  it('rejects transfer with missing fromStoreId', () => {
    const err = validateTransfer({ toStoreId: 'store_b', type: 'CASH', amount: 100_000 })
    expect(err).toBeTruthy()
    expect(err).toContain('fromStoreId')
  })

  it('rejects transfer where from equals to store', () => {
    const err = validateTransfer({ fromStoreId: 'store_a', toStoreId: 'store_a', type: 'CASH', amount: 100_000 })
    expect(err).toContain('must differ')
  })

  it('rejects STOCK transfer without productId or qty', () => {
    const err = validateTransfer({ fromStoreId: 'store_a', toStoreId: 'store_b', type: 'STOCK', amount: 100_000 })
    expect(err).toContain('productId')
  })

  it('accepts valid CASH transfer', () => {
    const err = validateTransfer({ fromStoreId: 'store_a', toStoreId: 'store_b', type: 'CASH', amount: 500_000 })
    expect(err).toBeNull()
  })

  it('accepts valid STOCK transfer with all required fields', () => {
    const err = validateTransfer({
      fromStoreId: 'store_a', toStoreId: 'store_b',
      type: 'STOCK', amount: 200_000, productId: 'prod_1', qty: 10,
    })
    expect(err).toBeNull()
  })
})

describe('Minority interest calculation', () => {
  it('calculates minority interest as percentage of store net profit', () => {
    const mi = calcMinorityInterest([storeB])
    // storeB netProfit: 3.5M - 1M = 2.5M, 20% minority = 500k
    expect(mi).toBeCloseTo(500_000, 0)
  })

  it('sums minority interest across multiple stores', () => {
    const mi = calcMinorityInterest([storeB, storeC])
    // storeB: 2.5M * 20% = 500k; storeC: (2.5M - 0.8M) * 30% = 510k
    expect(mi).toBeCloseTo(1_010_000, 0)
  })

  it('returns 0 minority interest for 100% owned stores', () => {
    const mi = calcMinorityInterest([{ ...storeA, minorityPct: 0 }])
    expect(mi).toBe(0)
  })
})

describe('Currency normalization', () => {
  it('converts IDR to USD using exchange rates', () => {
    // 1 USD = 16000 IDR → 1_600_000 IDR = 100 USD
    const usd = normalizeCurrency(1_600_000, 16_000, 1)
    expect(usd).toBeCloseTo(100, 5)
  })

  it('converts USD to IDR', () => {
    const idr = normalizeCurrency(100, 1, 16_000)
    expect(idr).toBeCloseTo(1_600_000, 0)
  })

  it('is identity when from and to rates are equal', () => {
    const result = normalizeCurrency(500_000, 16_000, 16_000)
    expect(result).toBeCloseTo(500_000, 0)
  })
})

describe('Net consolidated revenue', () => {
  it('calculates net consolidated revenue across all stores', () => {
    const revenue = netConsolidatedRevenue([storeA, storeB, storeC])
    expect(revenue).toBe(19_300_000) // (10M-500k) + (6M-0) + (4M-200k)
  })

  it('returns 0 for empty store list', () => {
    expect(netConsolidatedRevenue([])).toBe(0)
  })

  it('excludes full IC revenue when entire revenue is intercompany', () => {
    const pureIC: StoreConsolidated = {
      storeId: 'store_x', storeName: 'X', revenue: 1_000_000, cogs: 0,
      grossProfit: 1_000_000, operatingExpenses: 0, netProfit: 1_000_000,
      intercompanyRevenue: 1_000_000, intercompanyCost: 0,
    }
    expect(netConsolidatedRevenue([pureIC])).toBe(0)
  })
})
