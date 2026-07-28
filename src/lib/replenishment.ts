// Pure business logic for replenishment calculations
// Exported for unit tests

export type UrgencyLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'

/**
 * Calculate average daily sales velocity over a set of daily sales records.
 * salesData: array of { date: string; qty: number }
 * windowDays: number of days to consider (default 30)
 */
export function calcSalesVelocity(
  salesData: { date: string; qty: number }[],
  windowDays = 30
): number {
  if (windowDays <= 0) return 0
  const total = salesData.reduce((s, d) => s + d.qty, 0)
  return total / windowDays
}

/**
 * Days of stock remaining given current stock and daily velocity.
 * Returns Infinity when velocity is 0 (no sales → stock never runs out).
 */
export function calcDaysOfStock(currentStock: number, dailyVelocity: number): number {
  if (dailyVelocity <= 0) return Infinity
  if (currentStock <= 0) return 0
  return currentStock / dailyVelocity
}

/**
 * Whether stock has breached the reorder point (i.e. we should order).
 */
export function isReorderPointBreached(currentStock: number, reorderPoint: number): boolean {
  return currentStock <= reorderPoint
}

/**
 * Suggested order quantity using the max-stock formula:
 *   suggestedQty = maxStock - currentStock
 * Falls back to (safetyStock + leadTimeDemand) when maxStock is not configured.
 */
export function calcSuggestedQty(
  currentStock: number,
  dailyVelocity: number,
  leadTimeDays: number,
  safetyStock: number,
  maxStock: number | null
): number {
  if (maxStock !== null && maxStock > 0) {
    return Math.max(0, maxStock - currentStock)
  }
  // EOQ-inspired fallback: cover lead time demand + safety stock buffer
  const leadTimeDemand = dailyVelocity * leadTimeDays
  return Math.max(0, Math.ceil(leadTimeDemand + safetyStock - currentStock))
}

/**
 * Classify urgency based on days of stock remaining vs. lead time.
 *
 *  CRITICAL — already out of stock or stockout before lead time ends
 *  HIGH     — < lead time * 1.5 days remaining
 *  MEDIUM   — < lead time * 3 days remaining
 *  LOW      — reorder point breached but stock still comfortable
 */
export function classifyUrgency(
  daysOfStock: number,
  leadTimeDays: number
): UrgencyLevel {
  if (daysOfStock <= 0) return 'CRITICAL'
  const lt = leadTimeDays <= 0 ? 7 : leadTimeDays
  if (daysOfStock <= lt) return 'CRITICAL'
  if (daysOfStock <= lt * 1.5) return 'HIGH'
  if (daysOfStock <= lt * 3) return 'MEDIUM'
  return 'LOW'
}

/**
 * Estimate expected stockout date from today given days of stock remaining.
 * Returns ISO date string or null when stock never runs out.
 */
export function calcExpectedStockout(
  daysOfStock: number,
  fromDate: Date = new Date()
): string | null {
  if (!isFinite(daysOfStock) || daysOfStock > 3650) return null
  const d = new Date(fromDate)
  d.setDate(d.getDate() + Math.ceil(daysOfStock))
  return d.toISOString().slice(0, 10)
}
