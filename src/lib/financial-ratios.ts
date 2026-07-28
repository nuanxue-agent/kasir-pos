/**
 * @module financial-ratios
 * Pure calculation functions for financial ratio analysis.
 * All functions are side-effect-free and safe to import in tests.
 */

export interface FinancialSnapshot {
  id: string
  storeId: string
  period: string // e.g. "2024-Q1" or "2024-01"
  totalAssets: number
  currentAssets: number
  currentLiabilities: number
  inventory: number
  revenue: number
  grossProfit: number
  netProfit: number
  equity: number
  receivables: number
  computedAt: string
}

export interface FinancialRatios {
  currentRatio: number
  quickRatio: number
  grossMargin: number
  netMargin: number
  roa: number
  roe: number
  inventoryTurnover: number
  daysSalesOutstanding: number
}

// ── Liquidity ────────────────────────────────────────────────────────────────

/** Current Ratio = currentAssets / currentLiabilities */
export function calcCurrentRatio(currentAssets: number, currentLiabilities: number): number {
  if (currentLiabilities === 0) return 0
  return currentAssets / currentLiabilities
}

/** Quick Ratio = (currentAssets - inventory) / currentLiabilities */
export function calcQuickRatio(
  currentAssets: number,
  inventory: number,
  currentLiabilities: number,
): number {
  if (currentLiabilities === 0) return 0
  return (currentAssets - inventory) / currentLiabilities
}

// ── Profitability ─────────────────────────────────────────────────────────────

/** Gross Margin % = (grossProfit / revenue) * 100 */
export function calcGrossMargin(grossProfit: number, revenue: number): number {
  if (revenue === 0) return 0
  return (grossProfit / revenue) * 100
}

/** Net Margin % = (netProfit / revenue) * 100 */
export function calcNetMargin(netProfit: number, revenue: number): number {
  if (revenue === 0) return 0
  return (netProfit / revenue) * 100
}

/** ROA % = (netProfit / totalAssets) * 100 */
export function calcROA(netProfit: number, totalAssets: number): number {
  if (totalAssets === 0) return 0
  return (netProfit / totalAssets) * 100
}

/** ROE % = (netProfit / equity) * 100 */
export function calcROE(netProfit: number, equity: number): number {
  if (equity === 0) return 0
  return (netProfit / equity) * 100
}

// ── Efficiency ────────────────────────────────────────────────────────────────

/** Inventory Turnover = revenue / inventory (times per period) */
export function calcInventoryTurnover(revenue: number, inventory: number): number {
  if (inventory === 0) return 0
  return revenue / inventory
}

/** Days Sales Outstanding = (receivables / revenue) * 365 */
export function calcDaysSalesOutstanding(receivables: number, revenue: number): number {
  if (revenue === 0) return 0
  return (receivables / revenue) * 365
}

/** Compute all ratios from a snapshot */
export function computeRatios(s: FinancialSnapshot): FinancialRatios {
  return {
    currentRatio: calcCurrentRatio(s.currentAssets, s.currentLiabilities),
    quickRatio: calcQuickRatio(s.currentAssets, s.inventory, s.currentLiabilities),
    grossMargin: calcGrossMargin(s.grossProfit, s.revenue),
    netMargin: calcNetMargin(s.netProfit, s.revenue),
    roa: calcROA(s.netProfit, s.totalAssets),
    roe: calcROE(s.netProfit, s.equity),
    inventoryTurnover: calcInventoryTurnover(s.revenue, s.inventory),
    daysSalesOutstanding: calcDaysSalesOutstanding(s.receivables, s.revenue),
  }
}
