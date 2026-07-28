// Pure business logic for combo meal / product bundle builder
// No DB imports, no Next.js imports — fully testable

export type DiscountType = 'PERCENTAGE' | 'FIXED'

export interface Combo {
  id: string
  storeId: string
  name: string
  description?: string | null
  basePrice: number
  discountType: DiscountType
  discountValue: number
  active: boolean
  startDate?: string | null
  endDate?: string | null
  createdAt: string
  updatedAt: string
}

export interface ComboItem {
  id: string
  comboId: string
  storeId: string
  productId: string
  qty: number
  isOptional: boolean
  substituteGroupId?: string | null
  productName?: string
  productPrice?: number
}

export interface ComboSubstituteGroup {
  id: string
  comboId: string
  storeId: string
  name: string
  minPick: number
  maxPick: number
}

export interface ComboWithItems extends Combo {
  items: ComboItem[]
  substituteGroups?: ComboSubstituteGroup[]
}

// ─── Price calculation ────────────────────────────────────────────────────────

/**
 * Calculate the effective (final) price of a combo after applying discount.
 */
export function calcComboPrice(basePrice: number, discountType: DiscountType, discountValue: number): number {
  if (discountValue <= 0) return Math.max(0, basePrice)

  if (discountType === 'PERCENTAGE') {
    const pct = Math.min(100, discountValue)
    return Math.max(0, basePrice * (1 - pct / 100))
  }

  // FIXED
  return Math.max(0, basePrice - discountValue)
}

/**
 * Sum of individual product prices × qty for all required (non-optional) items.
 */
export function calcIndividualTotal(items: ComboItem[], includeOptional = false): number {
  return items
    .filter(item => includeOptional || !item.isOptional)
    .reduce((sum, item) => sum + (item.productPrice ?? 0) * item.qty, 0)
}

/**
 * How much the customer saves vs buying items individually.
 * Returns a non-negative savings amount.
 */
export function calcSavings(
  combo: Pick<Combo, 'basePrice' | 'discountType' | 'discountValue'>,
  items: ComboItem[],
  includeOptional = false,
): number {
  const individualTotal = calcIndividualTotal(items, includeOptional)
  const comboPrice = calcComboPrice(combo.basePrice, combo.discountType, combo.discountValue)
  return Math.max(0, individualTotal - comboPrice)
}

/**
 * Savings as a percentage of the individual total.
 */
export function calcSavingsPct(
  combo: Pick<Combo, 'basePrice' | 'discountType' | 'discountValue'>,
  items: ComboItem[],
  includeOptional = false,
): number {
  const individualTotal = calcIndividualTotal(items, includeOptional)
  if (individualTotal <= 0) return 0
  const savings = calcSavings(combo, items, includeOptional)
  return Math.round((savings / individualTotal) * 10000) / 100 // 2 decimal places
}

// ─── Active combo filtering ───────────────────────────────────────────────────

/**
 * Is this combo currently active (considering date range if present)?
 */
export function isComboActive(combo: Combo, now = new Date()): boolean {
  if (!combo.active) return false

  if (combo.startDate) {
    const start = new Date(combo.startDate)
    if (now < start) return false
  }

  if (combo.endDate) {
    const end = new Date(combo.endDate)
    // Include the full end date day
    const endOfDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate(), 23, 59, 59, 999))
    if (now > endOfDay) return false
  }

  return true
}

/**
 * Filter a list of combos to only currently active ones.
 */
export function filterActiveCombos(combos: Combo[], now = new Date()): Combo[] {
  return combos.filter(c => isComboActive(c, now))
}

// ─── Optional item handling ───────────────────────────────────────────────────

/**
 * Separate items into required and optional.
 */
export function partitionItems(items: ComboItem[]): { required: ComboItem[]; optional: ComboItem[] } {
  return {
    required: items.filter(i => !i.isOptional),
    optional: items.filter(i => i.isOptional),
  }
}

/**
 * Build the effective price of a combo with a specific selection of optional items.
 * selectedOptionalIds: productIds the customer has chosen from optional items.
 */
export function calcComboWithOptionals(
  combo: Pick<Combo, 'basePrice' | 'discountType' | 'discountValue'>,
  items: ComboItem[],
  selectedOptionalIds: string[],
): { comboPrice: number; individualTotal: number; savings: number } {
  const selectedSet = new Set(selectedOptionalIds)
  const effectiveItems = items.filter(i => !i.isOptional || selectedSet.has(i.productId))
  const individualTotal = calcIndividualTotal(effectiveItems, true)
  const comboPrice = calcComboPrice(combo.basePrice, combo.discountType, combo.discountValue)
  const savings = Math.max(0, individualTotal - comboPrice)
  return { comboPrice, individualTotal, savings }
}

// ─── Substitute group validation ─────────────────────────────────────────────

export interface SubstituteGroupValidationResult {
  valid: boolean
  errors: string[]
}

/**
 * Validate that the customer's item selections satisfy all substitute group constraints.
 * pickedByGroup: map of groupId → array of chosen productIds.
 */
export function validateSubstituteGroups(
  groups: ComboSubstituteGroup[],
  pickedByGroup: Record<string, string[]>,
): SubstituteGroupValidationResult {
  const errors: string[] = []

  for (const group of groups) {
    const picks = pickedByGroup[group.id] ?? []
    const count = picks.length

    if (group.minPick > 0 && count < group.minPick) {
      errors.push(`"${group.name}": pilih minimal ${group.minPick} item (terpilih: ${count})`)
    }
    if (group.maxPick > 0 && count > group.maxPick) {
      errors.push(`"${group.name}": pilih maksimal ${group.maxPick} item (terpilih: ${count})`)
    }
    // Duplicate picks check
    const unique = new Set(picks)
    if (unique.size !== picks.length) {
      errors.push(`"${group.name}": item tidak boleh dipilih lebih dari sekali`)
    }
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Validate substitute group schema: minPick must be ≤ maxPick (when both > 0).
 */
export function validateSubstituteGroupSchema(group: Pick<ComboSubstituteGroup, 'name' | 'minPick' | 'maxPick'>): string | null {
  if (group.minPick < 0 || group.maxPick < 0) return 'minPick dan maxPick tidak boleh negatif'
  if (group.maxPick > 0 && group.minPick > group.maxPick) {
    return `minPick (${group.minPick}) tidak boleh lebih besar dari maxPick (${group.maxPick})`
  }
  return null
}
