// Pure business logic for cost accounting — no DB or Next.js deps

export type CostCenterType = 'PRODUCTION' | 'OVERHEAD' | 'ADMIN' | 'SALES'

export interface ProductCostInput {
  materialCost: number
  laborCost: number
  overheadCost: number
}

export interface CostVarianceInput {
  standardCost: number
  actualCost: number
}

export interface CostCenterBudget {
  budget: number
  actualCost: number
}

// ─── Total cost ───────────────────────────────────────────────────────────────

export function calcTotalCost(input: ProductCostInput): number {
  return input.materialCost + input.laborCost + input.overheadCost
}

// ─── Cost variance (positive = favorable, negative = unfavorable) ─────────────

export function calcCostVariance(input: CostVarianceInput): number {
  return input.standardCost - input.actualCost
}

export function calcCostVariancePct(input: CostVarianceInput): number {
  if (input.standardCost === 0) return 0
  return ((input.standardCost - input.actualCost) / input.standardCost) * 100
}

export function isFavorableVariance(variance: number): boolean {
  return variance >= 0
}

// ─── Margin from cost ─────────────────────────────────────────────────────────

export function calcGrossMargin(sellingPrice: number, totalCost: number): number {
  return sellingPrice - totalCost
}

export function calcGrossMarginPct(sellingPrice: number, totalCost: number): number {
  if (sellingPrice === 0) return 0
  return ((sellingPrice - totalCost) / sellingPrice) * 100
}

export function calcMarkup(totalCost: number, sellingPrice: number): number {
  if (totalCost === 0) return 0
  return ((sellingPrice - totalCost) / totalCost) * 100
}

// ─── Overhead allocation ─────────────────────────────────────────────────────

/**
 * Allocates overhead proportionally based on direct cost (material + labor).
 * Returns overhead amount for this product.
 */
export function allocateOverhead(
  productDirectCost: number,
  totalDirectCosts: number,
  totalOverhead: number,
): number {
  if (totalDirectCosts === 0) return 0
  return (productDirectCost / totalDirectCosts) * totalOverhead
}

/**
 * Overhead rate as a percentage of direct cost.
 */
export function calcOverheadRate(totalOverhead: number, totalDirectCosts: number): number {
  if (totalDirectCosts === 0) return 0
  return (totalOverhead / totalDirectCosts) * 100
}

// ─── Cost per unit ────────────────────────────────────────────────────────────

export function calcCostPerUnit(totalCost: number, units: number): number {
  if (units === 0) return 0
  return totalCost / units
}

export function calcCOGS(costPerUnit: number, unitsSold: number): number {
  return costPerUnit * unitsSold
}

// ─── Budget variance for cost centers ────────────────────────────────────────

export function calcBudgetVariance(cc: CostCenterBudget): number {
  return cc.budget - cc.actualCost
}

export function calcBudgetUtilizationPct(cc: CostCenterBudget): number {
  if (cc.budget === 0) return 0
  return (cc.actualCost / cc.budget) * 100
}

export function isBudgetOverrun(cc: CostCenterBudget): boolean {
  return cc.actualCost > cc.budget
}
