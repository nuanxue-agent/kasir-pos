// ── Inventory Costing Library ─────────────────────────────────────────────────
// Provides FIFO cost calculation, weighted average cost, and expiry helpers.

export interface ExpiryBatch {
  id: string
  storeId: string
  productId: string
  batchNumber: string
  expiryDate: string // ISO date string "YYYY-MM-DD"
  qty: number
  costPerUnit: number
}

export interface FifoResult {
  /** Total cost for the consumed quantity */
  cost: number
  /** Updated batch list after consumption (depleted batches removed, partial remaining) */
  batches: ExpiryBatch[]
  /** Qty that could NOT be fulfilled (0 if stock was sufficient) */
  unfulfilled: number
}

/**
 * Calculate FIFO cost for consuming a given quantity from a set of batches.
 * Batches are consumed oldest-expiry-first (soonest to expire depleted first).
 * Non-expiring batches (no expiryDate) are treated as last-in.
 */
export function calcFifoCost(batches: ExpiryBatch[], qtyToConsume: number): FifoResult {
  if (qtyToConsume <= 0) {
    return { cost: 0, batches: [...batches], unfulfilled: 0 }
  }

  // Sort by expiryDate ascending (oldest expiry first = FIFO for perishables)
  const sorted = [...batches].sort((a, b) => {
    if (!a.expiryDate && !b.expiryDate) return 0
    if (!a.expiryDate) return 1
    if (!b.expiryDate) return -1
    return a.expiryDate.localeCompare(b.expiryDate)
  })

  let remaining = qtyToConsume
  let totalCost = 0
  const updatedBatches: ExpiryBatch[] = []

  for (const batch of sorted) {
    if (remaining <= 0) {
      updatedBatches.push({ ...batch })
      continue
    }
    if (batch.qty <= 0) continue

    const consume = Math.min(batch.qty, remaining)
    totalCost += consume * batch.costPerUnit
    remaining -= consume

    const leftover = batch.qty - consume
    if (leftover > 0) {
      updatedBatches.push({ ...batch, qty: leftover })
    }
    // Fully depleted batches are dropped
  }

  return {
    cost: Math.round(totalCost * 100) / 100,
    batches: updatedBatches,
    unfulfilled: remaining,
  }
}

/**
 * Calculate the weighted average cost across all batches.
 * Returns 0 if total qty is 0.
 */
export function calcWeightedAvgCost(batches: ExpiryBatch[]): number {
  const totalQty = batches.reduce((sum, b) => sum + b.qty, 0)
  if (totalQty === 0) return 0
  const totalCost = batches.reduce((sum, b) => sum + b.qty * b.costPerUnit, 0)
  return Math.round((totalCost / totalQty) * 100) / 100
}

/**
 * Return batches expiring within the given number of days (inclusive).
 * Expired batches (expiryDate < today) are NOT included — use getExpiredBatches for those.
 */
export function getBatchesExpiringSoon(batches: ExpiryBatch[], days: number): ExpiryBatch[] {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const cutoff = new Date(now)
  cutoff.setDate(cutoff.getDate() + days)

  return batches.filter(b => {
    if (!b.expiryDate) return false
    const exp = parseLocalDate(b.expiryDate)
    return exp >= now && exp <= cutoff
  })
}

/**
 * Return batches that are already expired (expiryDate < today).
 */
export function getExpiredBatches(batches: ExpiryBatch[]): ExpiryBatch[] {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return batches.filter(b => {
    if (!b.expiryDate) return false
    const exp = parseLocalDate(b.expiryDate)
    return exp < now
  })
}

export type ExpiryStatus = 'EXPIRED' | 'EXPIRING_SOON' | 'OK'

/**
 * Parse a YYYY-MM-DD date string as a local date (avoids UTC offset shifting).
 */
function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.slice(0, 10).split('-').map(Number)
  return new Date(year, month - 1, day)
}

/**
 * Determine expiry status for a single batch.
 */
export function getExpiryStatus(expiryDate: string, soonDays = 30): ExpiryStatus {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const exp = parseLocalDate(expiryDate)

  if (exp < now) return 'EXPIRED'
  const diff = Math.round((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (diff <= soonDays) return 'EXPIRING_SOON'
  return 'OK'
}
