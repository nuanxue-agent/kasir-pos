import { describe, it, expect } from 'vitest'

// ─── Pure depreciation helpers (mirrored from AssetManagementClient) ──────────

type DepreciationMethod = 'STRAIGHT_LINE' | 'DECLINING_BALANCE'

interface AssetLike {
  purchasePrice: number
  salvageValue: number
  usefulLife: number
  method: DepreciationMethod
}

interface DepreciationRow {
  year: number
  openingBookValue: number
  depreciation: number
  closingBookValue: number
}

function straightLineAnnual(purchasePrice: number, salvageValue: number, usefulLife: number): number {
  if (usefulLife <= 0) return 0
  return (purchasePrice - salvageValue) / usefulLife
}

function decliningBalanceRate(usefulLife: number): number {
  if (usefulLife <= 0) return 0
  return 2 / usefulLife
}

function bookValueAtYear(asset: AssetLike, year: number): number {
  const { purchasePrice, salvageValue, usefulLife, method } = asset
  if (year <= 0) return purchasePrice
  if (year >= usefulLife) return salvageValue

  if (method === 'STRAIGHT_LINE') {
    const annual = straightLineAnnual(purchasePrice, salvageValue, usefulLife)
    return Math.max(salvageValue, purchasePrice - annual * year)
  }

  const rate = decliningBalanceRate(usefulLife)
  let bv = purchasePrice
  for (let y = 0; y < year; y++) {
    const dep = bv * rate
    bv = Math.max(salvageValue, bv - dep)
  }
  return bv
}

function generateDepreciationSchedule(asset: AssetLike): DepreciationRow[] {
  const { purchasePrice, salvageValue, usefulLife, method } = asset
  if (usefulLife <= 0) return []
  const rows: DepreciationRow[] = []

  if (method === 'STRAIGHT_LINE') {
    const annual = straightLineAnnual(purchasePrice, salvageValue, usefulLife)
    let bv = purchasePrice
    for (let y = 1; y <= usefulLife; y++) {
      const dep = y < usefulLife ? annual : Math.max(0, bv - salvageValue)
      const closing = Math.max(salvageValue, bv - dep)
      rows.push({ year: y, openingBookValue: bv, depreciation: bv - closing, closingBookValue: closing })
      bv = closing
    }
  } else {
    const rate = decliningBalanceRate(usefulLife)
    let bv = purchasePrice
    for (let y = 1; y <= usefulLife; y++) {
      const dep = y < usefulLife ? bv * rate : Math.max(0, bv - salvageValue)
      const closing = Math.max(salvageValue, bv - dep)
      rows.push({ year: y, openingBookValue: bv, depreciation: bv - closing, closingBookValue: closing })
      bv = closing
    }
  }

  return rows
}

function monthlyDepreciation(asset: AssetLike): number {
  const schedule = generateDepreciationSchedule(asset)
  if (schedule.length === 0) return 0
  const totalDep = schedule.reduce((s, r) => s + r.depreciation, 0)
  return totalDep / (asset.usefulLife * 12)
}

function validateUsefulLife(usefulLife: number): string | null {
  if (!Number.isInteger(usefulLife) || usefulLife < 1) return 'usefulLife must be a positive integer'
  if (usefulLife > 50) return 'usefulLife cannot exceed 50 years'
  return null
}

// ─── Straight-line depreciation ───────────────────────────────────────────────

describe('Straight-line depreciation calculation', () => {
  it('computes annual depreciation correctly', () => {
    // (10_000_000 - 1_000_000) / 5 = 1_800_000
    expect(straightLineAnnual(10_000_000, 1_000_000, 5)).toBe(1_800_000)
  })

  it('annual depreciation is zero when useful life is 0', () => {
    expect(straightLineAnnual(10_000_000, 0, 0)).toBe(0)
  })

  it('spreads depreciation evenly across all years', () => {
    const asset: AssetLike = {
      purchasePrice: 12_000_000,
      salvageValue: 0,
      usefulLife: 4,
      method: 'STRAIGHT_LINE',
    }
    const schedule = generateDepreciationSchedule(asset)
    const expected = 3_000_000
    schedule.forEach(row => {
      expect(row.depreciation).toBeCloseTo(expected, 0)
    })
  })
})

// ─── Declining balance depreciation ──────────────────────────────────────────

describe('Declining balance depreciation', () => {
  it('rate is 2 / usefulLife', () => {
    expect(decliningBalanceRate(5)).toBe(0.4)
    expect(decliningBalanceRate(10)).toBe(0.2)
  })

  it('first year depreciation = purchasePrice * rate', () => {
    const asset: AssetLike = {
      purchasePrice: 10_000_000,
      salvageValue: 500_000,
      usefulLife: 5,
      method: 'DECLINING_BALANCE',
    }
    const schedule = generateDepreciationSchedule(asset)
    expect(schedule[0].depreciation).toBeCloseTo(10_000_000 * 0.4, 0)
  })

  it('each year depreciates on the declining book value', () => {
    const asset: AssetLike = {
      purchasePrice: 10_000_000,
      salvageValue: 0,
      usefulLife: 5,
      method: 'DECLINING_BALANCE',
    }
    const schedule = generateDepreciationSchedule(asset)
    // Year 1 opening should equal purchase price
    expect(schedule[0].openingBookValue).toBe(10_000_000)
    // Year 2 opening should equal year 1 closing
    expect(schedule[1].openingBookValue).toBeCloseTo(schedule[0].closingBookValue, 5)
  })
})

// ─── Book value at any period ─────────────────────────────────────────────────

describe('Book value at any period', () => {
  const asset: AssetLike = {
    purchasePrice: 10_000_000,
    salvageValue: 1_000_000,
    usefulLife: 5,
    method: 'STRAIGHT_LINE',
  }

  it('book value at year 0 equals purchase price', () => {
    expect(bookValueAtYear(asset, 0)).toBe(10_000_000)
  })

  it('book value at end of useful life equals salvage value', () => {
    expect(bookValueAtYear(asset, 5)).toBe(1_000_000)
  })

  it('book value never falls below salvage value', () => {
    for (let y = 0; y <= 10; y++) {
      expect(bookValueAtYear(asset, y)).toBeGreaterThanOrEqual(asset.salvageValue)
    }
  })
})

// ─── Useful life validation ───────────────────────────────────────────────────

describe('Useful life validation', () => {
  it('accepts a valid positive integer', () => {
    expect(validateUsefulLife(5)).toBeNull()
  })

  it('rejects zero', () => {
    expect(validateUsefulLife(0)).not.toBeNull()
  })

  it('rejects a negative value', () => {
    expect(validateUsefulLife(-3)).not.toBeNull()
  })

  it('rejects values over 50', () => {
    expect(validateUsefulLife(51)).not.toBeNull()
  })
})

// ─── Depreciation schedule generation ────────────────────────────────────────

describe('Depreciation schedule generation', () => {
  it('schedule length equals useful life', () => {
    const asset: AssetLike = { purchasePrice: 5_000_000, salvageValue: 0, usefulLife: 4, method: 'STRAIGHT_LINE' }
    expect(generateDepreciationSchedule(asset)).toHaveLength(4)
  })

  it('returns empty array when useful life is 0', () => {
    const asset: AssetLike = { purchasePrice: 5_000_000, salvageValue: 0, usefulLife: 0, method: 'STRAIGHT_LINE' }
    expect(generateDepreciationSchedule(asset)).toHaveLength(0)
  })

  it('final closing book value equals salvage value', () => {
    const asset: AssetLike = { purchasePrice: 6_000_000, salvageValue: 500_000, usefulLife: 5, method: 'STRAIGHT_LINE' }
    const schedule = generateDepreciationSchedule(asset)
    expect(schedule[schedule.length - 1].closingBookValue).toBeCloseTo(500_000, 0)
  })

  it('monthly depreciation is annual / 12 for straight-line', () => {
    const asset: AssetLike = { purchasePrice: 12_000_000, salvageValue: 0, usefulLife: 1, method: 'STRAIGHT_LINE' }
    // Total dep = 12_000_000 over 12 months = 1_000_000 / month
    expect(monthlyDepreciation(asset)).toBeCloseTo(1_000_000, 0)
  })
})
