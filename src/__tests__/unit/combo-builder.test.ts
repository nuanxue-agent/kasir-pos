import { describe, it, expect } from 'vitest'
import {
  calcComboPrice,
  calcIndividualTotal,
  calcSavings,
  calcSavingsPct,
  filterActiveCombos,
  isComboActive,
  partitionItems,
  calcComboWithOptionals,
  validateSubstituteGroups,
  validateSubstituteGroupSchema,
} from '@/lib/combo-builder'
import type { Combo, ComboItem, ComboSubstituteGroup } from '@/lib/combo-builder'

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const baseCombo: Combo = {
  id: 'c1',
  storeId: 's1',
  name: 'Paket Hemat A',
  basePrice: 50_000,
  discountType: 'PERCENTAGE',
  discountValue: 20,
  active: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

const fixedCombo: Combo = {
  ...baseCombo,
  id: 'c2',
  discountType: 'FIXED',
  discountValue: 10_000,
}

const items: ComboItem[] = [
  { id: 'i1', comboId: 'c1', storeId: 's1', productId: 'p1', qty: 1, isOptional: false, productPrice: 20_000, productName: 'Nasi Goreng' },
  { id: 'i2', comboId: 'c1', storeId: 's1', productId: 'p2', qty: 2, isOptional: false, productPrice: 10_000, productName: 'Es Teh' },
  { id: 'i3', comboId: 'c1', storeId: 's1', productId: 'p3', qty: 1, isOptional: true,  productPrice: 8_000,  productName: 'Kerupuk' },
]

// ─── 1. Combo price — PERCENTAGE discount ─────────────────────────────────────

describe('calcComboPrice', () => {
  it('applies percentage discount correctly', () => {
    // 50_000 * (1 - 0.20) = 40_000
    expect(calcComboPrice(50_000, 'PERCENTAGE', 20)).toBe(40_000)
  })

  it('applies fixed discount correctly', () => {
    // 50_000 - 10_000 = 40_000
    expect(calcComboPrice(50_000, 'FIXED', 10_000)).toBe(40_000)
  })

  it('floors result at 0 — fixed discount larger than price', () => {
    expect(calcComboPrice(5_000, 'FIXED', 10_000)).toBe(0)
  })

  it('caps percentage at 100 — discount > 100%', () => {
    // 100% discount → 0
    expect(calcComboPrice(50_000, 'PERCENTAGE', 150)).toBe(0)
  })

  it('returns basePrice unchanged when discountValue is 0', () => {
    expect(calcComboPrice(50_000, 'PERCENTAGE', 0)).toBe(50_000)
    expect(calcComboPrice(50_000, 'FIXED', 0)).toBe(50_000)
  })
})

// ─── 2. Individual total ────────────────────────────────────────────────────

describe('calcIndividualTotal', () => {
  it('sums required items only by default', () => {
    // (20_000 * 1) + (10_000 * 2) = 40_000  (optional kerupuk excluded)
    expect(calcIndividualTotal(items)).toBe(40_000)
  })

  it('includes optional items when flag is true', () => {
    // 40_000 + (8_000 * 1) = 48_000
    expect(calcIndividualTotal(items, true)).toBe(48_000)
  })

  it('returns 0 for empty items list', () => {
    expect(calcIndividualTotal([])).toBe(0)
  })
})

// ─── 3. Savings calculation ─────────────────────────────────────────────────

describe('calcSavings', () => {
  it('calculates savings vs buying required items individually', () => {
    // individualTotal = 40_000, comboPrice = 40_000 → savings = 0
    // but basePrice = 50_000 with 20% → 40_000, individualTotal also 40_000
    // Use a combo with basePrice lower than individual total
    const cheapCombo: Combo = { ...baseCombo, basePrice: 35_000, discountValue: 0 }
    // individualTotal=40_000, comboPrice=35_000 → savings=5_000
    expect(calcSavings(cheapCombo, items)).toBe(5_000)
  })

  it('returns 0 when combo price equals individual total', () => {
    // basePrice=40_000, 0% off → comboPrice=40_000, individualTotal=40_000
    const evenCombo: Combo = { ...baseCombo, basePrice: 40_000, discountValue: 0 }
    expect(calcSavings(evenCombo, items)).toBe(0)
  })

  it('never returns negative savings', () => {
    // Overpriced combo (basePrice > individualTotal with no discount)
    const expensiveCombo: Combo = { ...baseCombo, basePrice: 100_000, discountValue: 0 }
    expect(calcSavings(expensiveCombo, items)).toBe(0)
  })
})

// ─── 4. Savings percentage ──────────────────────────────────────────────────

describe('calcSavingsPct', () => {
  it('returns 0 when individual total is 0', () => {
    expect(calcSavingsPct(baseCombo, [])).toBe(0)
  })

  it('calculates correct savings percentage', () => {
    const cheapCombo: Combo = { ...baseCombo, basePrice: 30_000, discountValue: 0 }
    // individualTotal=40_000, savings=10_000 → pct=25.00
    expect(calcSavingsPct(cheapCombo, items)).toBe(25)
  })
})

// ─── 5. Optional item handling ──────────────────────────────────────────────

describe('partitionItems', () => {
  it('separates required and optional items correctly', () => {
    const { required, optional } = partitionItems(items)
    expect(required).toHaveLength(2)
    expect(optional).toHaveLength(1)
    expect(optional[0].productId).toBe('p3')
  })
})

describe('calcComboWithOptionals', () => {
  it('includes selected optional items in individual total', () => {
    const result = calcComboWithOptionals(baseCombo, items, ['p3'])
    // individualTotal = 40_000 + 8_000 = 48_000
    expect(result.individualTotal).toBe(48_000)
  })

  it('excludes unselected optional items', () => {
    const result = calcComboWithOptionals(baseCombo, items, [])
    expect(result.individualTotal).toBe(40_000)
  })
})

// ─── 6. Substitute group validation ────────────────────────────────────────

describe('validateSubstituteGroups', () => {
  const groups: ComboSubstituteGroup[] = [
    { id: 'g1', comboId: 'c1', storeId: 's1', name: 'Minuman', minPick: 1, maxPick: 2 },
  ]

  it('passes when picks are within min/max bounds', () => {
    const result = validateSubstituteGroups(groups, { g1: ['p10'] })
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('fails when fewer than minPick items selected', () => {
    const result = validateSubstituteGroups(groups, { g1: [] })
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('minimal 1')
  })

  it('fails when more than maxPick items selected', () => {
    const result = validateSubstituteGroups(groups, { g1: ['p10', 'p11', 'p12'] })
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('maksimal 2')
  })

  it('fails when duplicate products picked in same group', () => {
    const result = validateSubstituteGroups(groups, { g1: ['p10', 'p10'] })
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('lebih dari sekali'))).toBe(true)
  })
})

describe('validateSubstituteGroupSchema', () => {
  it('returns null for valid schema', () => {
    expect(validateSubstituteGroupSchema({ name: 'Minuman', minPick: 1, maxPick: 3 })).toBeNull()
  })

  it('returns error when minPick > maxPick', () => {
    const err = validateSubstituteGroupSchema({ name: 'Minuman', minPick: 3, maxPick: 1 })
    expect(err).not.toBeNull()
    expect(err).toContain('minPick')
  })

  it('allows maxPick=0 to mean unlimited', () => {
    // maxPick=0 means no upper bound — should be valid
    expect(validateSubstituteGroupSchema({ name: 'Minuman', minPick: 1, maxPick: 0 })).toBeNull()
  })
})

// ─── 7. Active combo filtering ──────────────────────────────────────────────

describe('filterActiveCombos', () => {
  const futureCombo: Combo = {
    ...baseCombo, id: 'c-future',
    startDate: '2099-01-01',
    endDate: null,
  }
  const expiredCombo: Combo = {
    ...baseCombo, id: 'c-expired',
    startDate: '2020-01-01',
    endDate: '2020-12-31',
  }
  const inactiveCombo: Combo = {
    ...baseCombo, id: 'c-inactive',
    active: false,
  }
  const activeCombo: Combo = {
    ...baseCombo, id: 'c-active',
    startDate: '2020-01-01',
    endDate: '2099-12-31',
  }

  it('excludes inactive combos', () => {
    const result = filterActiveCombos([inactiveCombo])
    expect(result).toHaveLength(0)
  })

  it('excludes combos whose startDate is in the future', () => {
    const result = filterActiveCombos([futureCombo])
    expect(result).toHaveLength(0)
  })

  it('excludes expired combos', () => {
    const result = filterActiveCombos([expiredCombo])
    expect(result).toHaveLength(0)
  })

  it('includes combos within valid date range', () => {
    const result = filterActiveCombos([activeCombo])
    expect(result).toHaveLength(1)
  })

  it('returns only active combos from a mixed list', () => {
    const all = [futureCombo, expiredCombo, inactiveCombo, activeCombo, baseCombo]
    const active = filterActiveCombos(all)
    // baseCombo has no dates so always active, activeCombo also valid
    expect(active.map(c => c.id)).toContain('c-active')
    expect(active.map(c => c.id)).toContain('c1')
    expect(active.map(c => c.id)).not.toContain('c-future')
    expect(active.map(c => c.id)).not.toContain('c-expired')
    expect(active.map(c => c.id)).not.toContain('c-inactive')
  })
})
