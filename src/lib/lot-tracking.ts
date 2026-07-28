// src/lib/lot-tracking.ts
// Pure business logic for lot/batch tracking — no DB, no Next.js deps

export type LotStatus = 'ACTIVE' | 'EXPIRED' | 'DEPLETED'
export type ExpiryAlertThreshold = 30 | 60 | 90

export interface Lot {
  id: string
  storeId: string
  productId: string
  lotNumber: string
  expiryDate: string       // ISO date YYYY-MM-DD
  receivedDate: string     // ISO date YYYY-MM-DD
  initialQty: number
  remainingQty: number
  supplierId: string | null
  costPerUnit: number
  status: LotStatus
  createdAt: string
  updatedAt: string
}

export interface LotWithProduct extends Lot {
  productName?: string
  supplierName?: string
}

// ── Expiry helpers ────────────────────────────────────────────────────────────

/**
 * Days until expiry (negative = already expired).
 * Uses UTC to avoid timezone drift.
 */
export function daysUntilExpiry(expiryDate: string, now = new Date()): number {
  const expiry = new Date(expiryDate + 'T00:00:00Z')
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  return Math.floor((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

/**
 * Returns true if the lot expires within the given threshold (days).
 * A threshold of 30 means: expiry within the next 30 days (inclusive).
 */
export function isExpiringWithin(expiryDate: string, thresholdDays: ExpiryAlertThreshold, now = new Date()): boolean {
  const days = daysUntilExpiry(expiryDate, now)
  return days >= 0 && days <= thresholdDays
}

/**
 * Returns true if the lot is already expired (expiryDate < today).
 */
export function isExpired(expiryDate: string, now = new Date()): boolean {
  return daysUntilExpiry(expiryDate, now) < 0
}

// ── Status transitions ────────────────────────────────────────────────────────

const VALID_STATUS_TRANSITIONS: Record<LotStatus, LotStatus[]> = {
  ACTIVE:   ['EXPIRED', 'DEPLETED'],
  EXPIRED:  ['ACTIVE'],           // can re-activate if expiry date corrected
  DEPLETED: [],                   // terminal
}

export function isValidStatusTransition(from: LotStatus, to: LotStatus): boolean {
  return VALID_STATUS_TRANSITIONS[from]?.includes(to) ?? false
}

/**
 * Derive the correct status from current data (used when auto-updating).
 */
export function deriveStatus(lot: Pick<Lot, 'remainingQty' | 'expiryDate'>, now = new Date()): LotStatus {
  if (lot.remainingQty <= 0) return 'DEPLETED'
  if (isExpired(lot.expiryDate, now)) return 'EXPIRED'
  return 'ACTIVE'
}

// ── Quantity helpers ──────────────────────────────────────────────────────────

/**
 * Apply a pick quantity to a lot. Returns new remainingQty.
 * Throws if pickQty exceeds remainingQty or is non-positive.
 */
export function applyPick(lot: Lot, pickQty: number): number {
  if (pickQty <= 0) throw new Error('pickQty must be positive')
  if (pickQty > lot.remainingQty) throw new Error('pickQty exceeds remainingQty')
  return lot.remainingQty - pickQty
}

// ── FEFO picking ──────────────────────────────────────────────────────────────

/**
 * Sort lots by FEFO (First Expired First Out).
 * Returns only ACTIVE lots, sorted by earliest expiryDate first.
 * Lots with the same expiryDate are sub-sorted by receivedDate (oldest first).
 */
export function fefoSort(lots: Lot[], now = new Date()): Lot[] {
  return lots
    .filter(l => l.status === 'ACTIVE' && l.remainingQty > 0 && !isExpired(l.expiryDate, now))
    .sort((a, b) => {
      const expiryDiff = a.expiryDate.localeCompare(b.expiryDate)
      if (expiryDiff !== 0) return expiryDiff
      return a.receivedDate.localeCompare(b.receivedDate)
    })
}

/**
 * Build a FEFO pick plan: returns ordered lots with how much to take from each
 * to satisfy the total requested qty.
 */
export interface PickLine {
  lot: Lot
  pickQty: number
}

export function buildFefoPickPlan(lots: Lot[], requestedQty: number, now = new Date()): PickLine[] {
  if (requestedQty <= 0) return []
  const sorted = fefoSort(lots, now)
  const plan: PickLine[] = []
  let remaining = requestedQty

  for (const lot of sorted) {
    if (remaining <= 0) break
    const take = Math.min(lot.remainingQty, remaining)
    plan.push({ lot, pickQty: take })
    remaining -= take
  }

  return plan
}

// ── Alert helpers ─────────────────────────────────────────────────────────────

export interface ExpiryAlert {
  lot: Lot
  daysUntilExpiry: number
  threshold: ExpiryAlertThreshold
}

/**
 * Return lots that are expiring within the given threshold,
 * sorted by nearest expiry first.
 */
export function getExpiryAlerts(lots: Lot[], threshold: ExpiryAlertThreshold, now = new Date()): ExpiryAlert[] {
  return lots
    .filter(l => l.status === 'ACTIVE' && l.remainingQty > 0 && isExpiringWithin(l.expiryDate, threshold, now))
    .map(l => ({
      lot: l,
      daysUntilExpiry: daysUntilExpiry(l.expiryDate, now),
      threshold,
    }))
    .sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry)
}
