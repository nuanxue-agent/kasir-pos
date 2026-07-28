// ── Flash Sale Pure Utility Functions ─────────────────────────────────────────
// Used by API routes, components, and unit tests.

export type SaleStatus = 'SCHEDULED' | 'ACTIVE' | 'ENDED' | 'CANCELLED'

export interface FlashSale {
  id: string
  storeId: string
  name: string
  startAt: string  // ISO
  endAt: string    // ISO
  status: SaleStatus
}

export interface FlashSaleItem {
  id: string
  saleId: string
  storeId: string
  productId: string
  originalPrice: number
  salePrice: number
  discountPct: number
  stockLimit: number
  soldQty: number
  active: boolean
}

// ── Status Detection ───────────────────────────────────────────────────────────

/** Derives computed status from timestamps. Ignores persisted status. */
export function detectSaleStatus(startAt: string, endAt: string, nowMs?: number): SaleStatus {
  const now = nowMs ?? Date.now()
  const start = new Date(startAt).getTime()
  const end   = new Date(endAt).getTime()
  if (isNaN(start) || isNaN(end)) return 'ENDED'
  if (now < start) return 'SCHEDULED'
  if (now >= start && now <= end) return 'ACTIVE'
  return 'ENDED'
}

/** Returns true if the sale is currently live (ACTIVE and not cancelled). */
export function isSaleActive(sale: Pick<FlashSale, 'status' | 'startAt' | 'endAt'>, nowMs?: number): boolean {
  if (sale.status === 'CANCELLED') return false
  return detectSaleStatus(sale.startAt, sale.endAt, nowMs) === 'ACTIVE'
}

// ── Discount Calculation ───────────────────────────────────────────────────────

/**
 * Calculates discount percentage from original and sale price.
 * Returns a value 0–100, rounded to 2 decimal places.
 */
export function calcDiscountPct(originalPrice: number, salePrice: number): number {
  if (originalPrice <= 0) return 0
  if (salePrice >= originalPrice) return 0
  const pct = ((originalPrice - salePrice) / originalPrice) * 100
  return Math.round(pct * 100) / 100
}

/**
 * Applies a discount percentage to a base price.
 * Returns the discounted price, never below 0.
 */
export function applyDiscountPct(originalPrice: number, discountPct: number): number {
  if (discountPct <= 0) return originalPrice
  if (discountPct >= 100) return 0
  const result = originalPrice * (1 - discountPct / 100)
  return Math.max(0, Math.round(result))
}

// ── Stock Calculation ──────────────────────────────────────────────────────────

/** Returns remaining stock. Clamps to 0 — never negative. */
export function calcStockRemaining(stockLimit: number, soldQty: number): number {
  return Math.max(0, stockLimit - soldQty)
}

/** Returns stock utilisation percentage (0–100). */
export function calcStockUsedPct(stockLimit: number, soldQty: number): number {
  if (stockLimit <= 0) return 0
  return Math.min(100, Math.round((soldQty / stockLimit) * 100))
}

/** Returns true if the item still has stock available. */
export function hasStock(item: Pick<FlashSaleItem, 'stockLimit' | 'soldQty' | 'active'>): boolean {
  if (!item.active) return false
  if (item.stockLimit <= 0) return true   // unlimited
  return item.soldQty < item.stockLimit
}

// ── Validity ───────────────────────────────────────────────────────────────────

export interface SaleValidityResult {
  valid: boolean
  reason?: string
}

/** Validates a flash sale definition before insert/update. */
export function validateSale(
  name: string,
  startAt: string,
  endAt: string,
): SaleValidityResult {
  if (!name?.trim()) return { valid: false, reason: 'name is required' }
  const start = new Date(startAt).getTime()
  const end   = new Date(endAt).getTime()
  if (isNaN(start)) return { valid: false, reason: 'startAt is invalid' }
  if (isNaN(end))   return { valid: false, reason: 'endAt is invalid' }
  if (end <= start) return { valid: false, reason: 'endAt must be after startAt' }
  return { valid: true }
}

// ── Countdown ─────────────────────────────────────────────────────────────────

/**
 * Seconds remaining until the sale ends.
 * Returns 0 if already ended or not yet started and endAt passed.
 */
export function countdownSecondsRemaining(endAt: string, nowMs?: number): number {
  const now = nowMs ?? Date.now()
  const end = new Date(endAt).getTime()
  if (isNaN(end)) return 0
  return Math.max(0, Math.floor((end - now) / 1000))
}

/**
 * Formats seconds into HH:MM:SS display string.
 */
export function formatCountdown(seconds: number): string {
  if (seconds <= 0) return '00:00:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':')
}
