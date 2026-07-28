// Pure helpers for price list calculations — used by API routes and unit tests

export type DiscountType = 'FIXED' | 'PERCENTAGE'
export type PriceListType = 'RETAIL' | 'WHOLESALE' | 'VIP' | 'CUSTOM'

export interface PriceList {
  id: string
  storeId: string
  name: string
  description?: string | null
  type: PriceListType
  discountType: DiscountType
  discountValue: number
  active: boolean
  validFrom?: string | null
  validTo?: string | null
}

export interface PriceListItem {
  id: string
  priceListId: string
  storeId: string
  productId: string
  price: number
  minQty: number
}

export interface CustomerPriceList {
  id: string
  customerId: string
  storeId: string
  priceListId: string
  assignedAt: string
}

// ── Price calculation ─────────────────────────────────────────────────────────

/**
 * Apply a price list's discount to a base price.
 * PERCENTAGE: price * (1 - discountValue / 100)
 * FIXED: price - discountValue (floor 0)
 */
export function applyPriceListDiscount(
  basePrice: number,
  discountType: DiscountType,
  discountValue: number,
): number {
  if (discountType === 'PERCENTAGE') {
    const pct = Math.min(Math.max(discountValue, 0), 100)
    return Math.round(basePrice * (1 - pct / 100))
  }
  return Math.max(0, Math.round(basePrice - discountValue))
}

/**
 * Resolve the effective unit price for a product given a set of PriceListItems
 * and the quantity being ordered.
 *
 * Rules:
 * 1. Filter items for the given productId.
 * 2. Keep only items whose minQty <= qty.
 * 3. Among those, pick the one with the highest minQty (best tier for the qty).
 * 4. If no item matches, return null (caller should fall back to base price or
 *    apply the price list header discount instead).
 */
export function resolveItemPrice(
  items: PriceListItem[],
  productId: string,
  qty: number,
): number | null {
  const eligible = items.filter(i => i.productId === productId && i.minQty <= qty)
  if (eligible.length === 0) return null
  eligible.sort((a, b) => b.minQty - a.minQty)
  return eligible[0].price
}

// ── Validity checks ───────────────────────────────────────────────────────────

/**
 * Returns true when the price list is active AND within its validity window.
 * Pass an ISO date string or Date for `now`; defaults to current time.
 */
export function isPriceListValid(pl: PriceList, now: string | Date = new Date()): boolean {
  if (!pl.active) return false
  const ts = typeof now === 'string' ? new Date(now).getTime() : now.getTime()
  if (pl.validFrom && new Date(pl.validFrom).getTime() > ts) return false
  if (pl.validTo && new Date(pl.validTo).getTime() < ts) return false
  return true
}

// ── Customer price list resolution ────────────────────────────────────────────

/**
 * Given a customer's assigned price lists and all available price lists,
 * return the first valid PriceList for that customer (most recently assigned).
 * Returns null if none are valid.
 */
export function resolveCustomerPriceList(
  assignments: CustomerPriceList[],
  priceLists: PriceList[],
  customerId: string,
  now: string | Date = new Date(),
): PriceList | null {
  const customerAssignments = assignments
    .filter(a => a.customerId === customerId)
    .sort((a, b) => new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime())

  for (const assignment of customerAssignments) {
    const pl = priceLists.find(p => p.id === assignment.priceListId)
    if (pl && isPriceListValid(pl, now)) return pl
  }
  return null
}

/**
 * Get all valid price lists from a collection, sorted by type priority:
 * VIP > WHOLESALE > RETAIL > CUSTOM
 */
export function getActivePriceLists(
  priceLists: PriceList[],
  now: string | Date = new Date(),
): PriceList[] {
  const priority: Record<PriceListType, number> = { VIP: 0, WHOLESALE: 1, RETAIL: 2, CUSTOM: 3 }
  return priceLists
    .filter(pl => isPriceListValid(pl, now))
    .sort((a, b) => priority[a.type] - priority[b.type])
}
