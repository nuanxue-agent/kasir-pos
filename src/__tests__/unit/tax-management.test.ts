import { describe, it, expect } from 'vitest'
import {
  applyTaxRate,
  applyMultipleTaxRates,
  calcTaxInclusive,
  getDefaultTaxRate,
} from '@/components/settings/TaxSettingsClient'
import type { TaxRate } from '@/components/settings/TaxSettingsClient'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ppn11: TaxRate = {
  id: '1', storeId: 's1', name: 'PPN 11%', rate: 11,
  type: 'PERCENTAGE', appliesTo: 'ALL', active: true, isDefault: true,
}

const serviceCharge5: TaxRate = {
  id: '2', storeId: 's1', name: 'Service Charge 5%', rate: 5,
  type: 'PERCENTAGE', appliesTo: 'SERVICE', active: true, isDefault: false,
}

const fixedTax: TaxRate = {
  id: '3', storeId: 's1', name: 'Fixed Tax', rate: 5000,
  type: 'FIXED', appliesTo: 'ALL', active: true, isDefault: false,
}

const inactiveRate: TaxRate = {
  id: '4', storeId: 's1', name: 'Inactive PPN', rate: 10,
  type: 'PERCENTAGE', appliesTo: 'ALL', active: false, isDefault: false,
}

// ─── Tax calculation — percentage ─────────────────────────────────────────────

describe('applyTaxRate — PERCENTAGE', () => {
  it('calculates 11% on 1,000,000 correctly', () => {
    expect(applyTaxRate(1_000_000, ppn11)).toBe(110_000)
  })

  it('calculates 5% service charge on 200,000', () => {
    expect(applyTaxRate(200_000, serviceCharge5)).toBe(10_000)
  })

  it('returns 0 for an inactive rate', () => {
    expect(applyTaxRate(1_000_000, inactiveRate)).toBe(0)
  })
})

// ─── Tax calculation — fixed ──────────────────────────────────────────────────

describe('applyTaxRate — FIXED', () => {
  it('returns the fixed amount regardless of base', () => {
    expect(applyTaxRate(1_000_000, fixedTax)).toBe(5_000)
  })

  it('returns the same fixed amount for a different base', () => {
    expect(applyTaxRate(50_000, fixedTax)).toBe(5_000)
  })
})

// ─── Multiple tax rates applied ───────────────────────────────────────────────

describe('applyMultipleTaxRates', () => {
  it('sums percentage + fixed rates correctly', () => {
    const { total } = applyMultipleTaxRates(1_000_000, [ppn11, fixedTax])
    // 110,000 + 5,000
    expect(total).toBe(115_000)
  })

  it('skips inactive rates in the total', () => {
    const { total } = applyMultipleTaxRates(1_000_000, [ppn11, inactiveRate])
    expect(total).toBe(110_000)
  })

  it('returns per-rate breakdown with correct amounts', () => {
    const { breakdown } = applyMultipleTaxRates(200_000, [ppn11, serviceCharge5])
    expect(breakdown).toHaveLength(2)
    expect(breakdown[0].amount).toBe(22_000)  // 11%
    expect(breakdown[1].amount).toBe(10_000)  // 5%
  })

  it('returns zero total for empty rates array', () => {
    const { total } = applyMultipleTaxRates(1_000_000, [])
    expect(total).toBe(0)
  })
})

// ─── Tax-inclusive vs exclusive pricing ───────────────────────────────────────

describe('calcTaxInclusive', () => {
  it('extracts base from inclusive price with single 11% rate', () => {
    // 1,110,000 inclusive → base = 1,000,000
    const { base } = calcTaxInclusive(1_110_000, [ppn11])
    expect(base).toBe(1_000_000)
  })

  it('base + totalTax ≈ gross (within ±1 rounding)', () => {
    const gross = 777_000
    const { base, totalTax } = calcTaxInclusive(gross, [ppn11])
    expect(Math.abs(base + totalTax - gross)).toBeLessThanOrEqual(1)
  })

  it('returns gross as base when no active percentage rates', () => {
    const { base } = calcTaxInclusive(500_000, [inactiveRate])
    expect(base).toBe(500_000)
  })
})

// ─── Default tax rate selection ───────────────────────────────────────────────

describe('getDefaultTaxRate', () => {
  it('returns the rate marked isDefault', () => {
    const result = getDefaultTaxRate([serviceCharge5, ppn11])
    expect(result?.id).toBe('1')
  })

  it('falls back to first active rate when no default is set', () => {
    const noDefault = [
      { ...ppn11, isDefault: false },
      { ...serviceCharge5, isDefault: false },
    ]
    const result = getDefaultTaxRate(noDefault)
    expect(result?.id).toBe('1')
  })

  it('returns null for an empty array', () => {
    expect(getDefaultTaxRate([])).toBeNull()
  })

  it('ignores inactive rates when picking default', () => {
    const result = getDefaultTaxRate([inactiveRate, serviceCharge5])
    expect(result?.id).toBe('2')
  })
})
