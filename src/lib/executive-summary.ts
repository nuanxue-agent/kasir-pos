// Pure business logic for executive summary — no DB, no Next.js deps

export interface PeriodMetrics {
  revenue: number
  cost: number
  grossProfit: number
  orders: number
  newCustomers: number
  totalCustomers: number
  avgOrderValue: number
}

export interface ProductRank {
  productId: string
  name: string
  revenue: number
  unitsSold: number
}

export interface CustomerRank {
  customerId: string
  name: string
  totalSpend: number
  orderCount: number
}

export interface GrowthRates {
  revenueGrowthMoM: number   // vs last month
  revenueGrowthYoY: number   // vs same month last year
  ordersGrowthMoM: number
  grossProfitGrowthMoM: number
}

// ── Period comparison ─────────────────────────────────────────────────────────

/**
 * Calculate growth rate between two values.
 * Returns 0 when base is 0 to avoid division-by-zero.
 */
export function calcGrowthRate(current: number, previous: number): number {
  if (previous === 0) return 0
  return Math.round(((current - previous) / previous) * 10000) / 100 // 2 decimal places
}

/**
 * Calculate MoM and YoY growth rates from three period snapshots.
 */
export function calcGrowthRates(
  current: PeriodMetrics,
  lastMonth: PeriodMetrics,
  sameMonthLastYear: PeriodMetrics,
): GrowthRates {
  return {
    revenueGrowthMoM: calcGrowthRate(current.revenue, lastMonth.revenue),
    revenueGrowthYoY: calcGrowthRate(current.revenue, sameMonthLastYear.revenue),
    ordersGrowthMoM: calcGrowthRate(current.orders, lastMonth.orders),
    grossProfitGrowthMoM: calcGrowthRate(current.grossProfit, lastMonth.grossProfit),
  }
}

// ── Gross profit ──────────────────────────────────────────────────────────────

export function calcGrossProfit(revenue: number, cost: number): number {
  return revenue - cost
}

export function calcGrossMarginPct(revenue: number, cost: number): number {
  if (revenue === 0) return 0
  return Math.round(((revenue - cost) / revenue) * 10000) / 100
}

// ── Average order value ───────────────────────────────────────────────────────

export function calcAvgOrderValue(revenue: number, orders: number): number {
  if (orders === 0) return 0
  return Math.round(revenue / orders)
}

// ── LTV (Lifetime Value) ──────────────────────────────────────────────────────

/**
 * Simple LTV: avgOrderValue × purchaseFrequency × avgLifespanMonths
 * purchaseFrequency = orders / customers (per period)
 * avgLifespanMonths defaults to 12 (one year) if not provided
 */
export function calcLTV(
  avgOrderValue: number,
  totalOrders: number,
  totalCustomers: number,
  avgLifespanMonths = 12,
): number {
  if (totalCustomers === 0 || avgLifespanMonths === 0) return 0
  const purchaseFrequency = totalOrders / totalCustomers
  return Math.round(avgOrderValue * purchaseFrequency * avgLifespanMonths)
}

// ── Customer Acquisition Cost ─────────────────────────────────────────────────

/**
 * CAC = totalMarketingSpend / newCustomers
 * Returns Infinity when newCustomers is 0 (no acquisition happened).
 */
export function calcCAC(totalMarketingSpend: number, newCustomers: number): number {
  if (newCustomers === 0) return 0
  return Math.round((totalMarketingSpend / newCustomers) * 100) / 100
}

// ── Top N ranking ─────────────────────────────────────────────────────────────

/**
 * Returns the top N products sorted by revenue descending.
 */
export function topNProducts(products: ProductRank[], n: number): ProductRank[] {
  return [...products].sort((a, b) => b.revenue - a.revenue).slice(0, n)
}

/**
 * Returns the top N customers sorted by total spend descending.
 */
export function topNCustomers(customers: CustomerRank[], n: number): CustomerRank[] {
  return [...customers].sort((a, b) => b.totalSpend - a.totalSpend).slice(0, n)
}

// ── Period boundaries (UTC-safe) ──────────────────────────────────────────────

/**
 * Returns ISO period string "YYYY-MM" for a given date.
 */
export function toPeriodString(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

/**
 * Returns start/end ISO timestamps for a YYYY-MM period.
 */
export function periodBoundaries(period: string): { start: string; end: string } {
  const [year, month] = period.split('-').map(Number)
  const start = new Date(Date.UTC(year, month - 1, 1))
  const end = new Date(Date.UTC(year, month, 1)) // exclusive — start of next month
  return { start: start.toISOString(), end: end.toISOString() }
}

/**
 * Returns the YYYY-MM string for the month N months before the given period.
 */
export function prevPeriod(period: string, monthsBack = 1): string {
  const [year, month] = period.split('-').map(Number)
  const d = new Date(Date.UTC(year, month - 1 - monthsBack, 1))
  return toPeriodString(d)
}
