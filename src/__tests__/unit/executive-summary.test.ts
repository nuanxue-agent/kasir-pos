import { describe, it, expect } from 'vitest'
import {
  calcGrowthRate,
  calcGrowthRates,
  calcGrossProfit,
  calcGrossMarginPct,
  calcAvgOrderValue,
  calcLTV,
  calcCAC,
  topNProducts,
  topNCustomers,
  toPeriodString,
  prevPeriod,
  periodBoundaries,
} from '@/lib/executive-summary'
import type { PeriodMetrics, ProductRank, CustomerRank } from '@/lib/executive-summary'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const currentPeriod: PeriodMetrics = {
  revenue: 10_000_000,
  cost: 6_000_000,
  grossProfit: 4_000_000,
  orders: 200,
  newCustomers: 25,
  totalCustomers: 80,
  avgOrderValue: 50_000,
}

const lastMonthPeriod: PeriodMetrics = {
  revenue: 8_000_000,
  cost: 5_000_000,
  grossProfit: 3_000_000,
  orders: 160,
  newCustomers: 20,
  totalCustomers: 70,
  avgOrderValue: 50_000,
}

const yearAgoPeriod: PeriodMetrics = {
  revenue: 5_000_000,
  cost: 3_200_000,
  grossProfit: 1_800_000,
  orders: 100,
  newCustomers: 10,
  totalCustomers: 40,
  avgOrderValue: 50_000,
}

const products: ProductRank[] = [
  { productId: 'p1', name: 'Kopi Susu', revenue: 5_000_000, unitsSold: 500 },
  { productId: 'p2', name: 'Teh Manis', revenue: 3_000_000, unitsSold: 400 },
  { productId: 'p3', name: 'Jus Alpukat', revenue: 2_500_000, unitsSold: 250 },
  { productId: 'p4', name: 'Nasi Goreng', revenue: 2_000_000, unitsSold: 200 },
  { productId: 'p5', name: 'Mie Ayam', revenue: 1_800_000, unitsSold: 180 },
  { productId: 'p6', name: 'Soto Ayam', revenue: 1_200_000, unitsSold: 120 },
]

const customers: CustomerRank[] = [
  { customerId: 'c1', name: 'Budi Santoso', totalSpend: 2_000_000, orderCount: 40 },
  { customerId: 'c2', name: 'Siti Rahayu', totalSpend: 1_800_000, orderCount: 36 },
  { customerId: 'c3', name: 'Ahmad Fauzi', totalSpend: 1_500_000, orderCount: 30 },
  { customerId: 'c4', name: 'Dewi Lestari', totalSpend: 1_200_000, orderCount: 24 },
  { customerId: 'c5', name: 'Rizky Pratama', totalSpend: 900_000, orderCount: 18 },
  { customerId: 'c6', name: 'Rina Wati', totalSpend: 500_000, orderCount: 10 },
]

// ── Period comparison ─────────────────────────────────────────────────────────

describe('Period comparison', () => {
  it('calculates period comparison revenue correctly', () => {
    const { revenueGrowthMoM } = calcGrowthRates(currentPeriod, lastMonthPeriod, yearAgoPeriod)
    // (10M - 8M) / 8M * 100 = 25%
    expect(revenueGrowthMoM).toBe(25)
  })

  it('calculates YoY revenue growth correctly', () => {
    const { revenueGrowthYoY } = calcGrowthRates(currentPeriod, lastMonthPeriod, yearAgoPeriod)
    // (10M - 5M) / 5M * 100 = 100%
    expect(revenueGrowthYoY).toBe(100)
  })

  it('calculates orders MoM growth correctly', () => {
    const { ordersGrowthMoM } = calcGrowthRates(currentPeriod, lastMonthPeriod, yearAgoPeriod)
    // (200 - 160) / 160 * 100 = 25%
    expect(ordersGrowthMoM).toBe(25)
  })

  it('calculates gross profit MoM growth correctly', () => {
    const { grossProfitGrowthMoM } = calcGrowthRates(currentPeriod, lastMonthPeriod, yearAgoPeriod)
    // (4M - 3M) / 3M * 100 = 33.33%
    expect(grossProfitGrowthMoM).toBeCloseTo(33.33, 1)
  })
})

// ── Growth rate calculation ───────────────────────────────────────────────────

describe('Growth rate calculation', () => {
  it('returns positive growth when current > previous', () => {
    expect(calcGrowthRate(1200, 1000)).toBe(20)
  })

  it('returns negative growth when current < previous', () => {
    expect(calcGrowthRate(800, 1000)).toBe(-20)
  })

  it('returns 0 when base is 0 to avoid division-by-zero', () => {
    expect(calcGrowthRate(500, 0)).toBe(0)
  })

  it('returns 0 when current equals previous', () => {
    expect(calcGrowthRate(1000, 1000)).toBe(0)
  })

  it('preserves two decimal places in growth rate', () => {
    // (1100 - 900) / 900 * 100 = 22.22...%
    expect(calcGrowthRate(1100, 900)).toBe(22.22)
  })
})

// ── Gross profit calculation ──────────────────────────────────────────────────

describe('Gross profit and margin', () => {
  it('calculates gross profit correctly', () => {
    expect(calcGrossProfit(10_000_000, 6_000_000)).toBe(4_000_000)
  })

  it('calculates gross margin percentage correctly', () => {
    expect(calcGrossMarginPct(10_000_000, 6_000_000)).toBe(40)
  })

  it('returns 0 gross margin when revenue is 0', () => {
    expect(calcGrossMarginPct(0, 0)).toBe(0)
  })
})

// ── LTV calculation ───────────────────────────────────────────────────────────

describe('LTV calculation', () => {
  it('calculates LTV correctly with standard inputs', () => {
    // avgOrderValue=50000, orders=200, customers=80 → freq=2.5, LTV=50000*2.5*12=1500000
    expect(calcLTV(50_000, 200, 80, 12)).toBe(1_500_000)
  })

  it('returns 0 when totalCustomers is 0', () => {
    expect(calcLTV(50_000, 200, 0, 12)).toBe(0)
  })

  it('returns 0 when avgLifespanMonths is 0', () => {
    expect(calcLTV(50_000, 200, 80, 0)).toBe(0)
  })

  it('scales LTV proportionally with lifespan', () => {
    const ltv6 = calcLTV(50_000, 200, 80, 6)
    const ltv12 = calcLTV(50_000, 200, 80, 12)
    expect(ltv12).toBe(ltv6 * 2)
  })
})

// ── Customer acquisition cost ─────────────────────────────────────────────────

describe('Customer acquisition cost', () => {
  it('calculates CAC correctly', () => {
    expect(calcCAC(5_000_000, 25)).toBe(200_000)
  })

  it('returns 0 when newCustomers is 0', () => {
    expect(calcCAC(1_000_000, 0)).toBe(0)
  })

  it('rounds CAC to 2 decimal places', () => {
    // 1000 / 3 = 333.33...
    expect(calcCAC(1000, 3)).toBe(333.33)
  })
})

// ── Top N ranking ─────────────────────────────────────────────────────────────

describe('Top N ranking', () => {
  it('returns top 5 products sorted by revenue descending', () => {
    const top5 = topNProducts(products, 5)
    expect(top5).toHaveLength(5)
    expect(top5[0].productId).toBe('p1')
    expect(top5[4].productId).toBe('p5')
  })

  it('does not include the 6th product in top 5', () => {
    const top5 = topNProducts(products, 5)
    const ids = top5.map(p => p.productId)
    expect(ids).not.toContain('p6')
  })

  it('returns top 5 customers sorted by totalSpend descending', () => {
    const top5 = topNCustomers(customers, 5)
    expect(top5).toHaveLength(5)
    expect(top5[0].customerId).toBe('c1')
    expect(top5[4].customerId).toBe('c5')
  })

  it('does not include the 6th customer in top 5', () => {
    const top5 = topNCustomers(customers, 5)
    const ids = top5.map(c => c.customerId)
    expect(ids).not.toContain('c6')
  })

  it('handles topNProducts with n larger than list length', () => {
    const all = topNProducts(products, 100)
    expect(all).toHaveLength(products.length)
  })

  it('does not mutate the original products array', () => {
    const original = [...products]
    topNProducts(products, 3)
    expect(products).toEqual(original)
  })
})

// ── Period boundaries ─────────────────────────────────────────────────────────

describe('Period boundary helpers', () => {
  it('toPeriodString returns correct YYYY-MM for a UTC date', () => {
    const d = new Date(Date.UTC(2026, 6, 15)) // July 2026
    expect(toPeriodString(d)).toBe('2026-07')
  })

  it('prevPeriod goes back one month correctly', () => {
    expect(prevPeriod('2026-01', 1)).toBe('2025-12')
  })

  it('prevPeriod goes back 12 months correctly', () => {
    expect(prevPeriod('2026-07', 12)).toBe('2025-07')
  })

  it('periodBoundaries start is start of month', () => {
    const { start } = periodBoundaries('2026-07')
    expect(start).toBe('2026-07-01T00:00:00.000Z')
  })

  it('periodBoundaries end is start of next month (exclusive)', () => {
    const { end } = periodBoundaries('2026-07')
    expect(end).toBe('2026-08-01T00:00:00.000Z')
  })
})

// ── Average order value ───────────────────────────────────────────────────────

describe('Average order value', () => {
  it('calculates AOV correctly', () => {
    expect(calcAvgOrderValue(10_000_000, 200)).toBe(50_000)
  })

  it('returns 0 when orders is 0', () => {
    expect(calcAvgOrderValue(10_000_000, 0)).toBe(0)
  })
})
