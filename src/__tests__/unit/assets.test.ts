import { describe, it, expect } from 'vitest'

// ── Domain types ────────────────────────────────────────────────────────────────

type DepreciationMethod = 'STRAIGHT_LINE' | 'DECLINING_BALANCE'

interface Asset {
  id: string
  storeId: string
  name: string
  category: string
  purchaseDate: string
  purchasePrice: number
  usefulLife: number   // years
  method: DepreciationMethod
  salvageValue: number
  status: 'ACTIVE' | 'DISPOSED' | 'UNDER_MAINTENANCE'
}

interface DepreciationEntry {
  year: number
  openingBookValue: number
  depreciationAmount: number
  closingBookValue: number
  accumulatedDepreciation: number
}

// ── Pure functions under test ──────────────────────────────────────────────────

function calcStraightLineAnnual(asset: Pick<Asset, 'purchasePrice' | 'salvageValue' | 'usefulLife'>): number {
  if (asset.usefulLife <= 0) throw new Error('usefulLife must be > 0')
  return (asset.purchasePrice - asset.salvageValue) / asset.usefulLife
}

function calcDecliningBalanceAnnual(
  bookValue: number,
  usefulLife: number,
  multiplier = 2,
): number {
  if (usefulLife <= 0) throw new Error('usefulLife must be > 0')
  const rate = multiplier / usefulLife
  return bookValue * rate
}

function calcBookValueAtYear(asset: Asset, year: number): number {
  if (year < 0) throw new Error('year must be >= 0')
  if (year === 0) return asset.purchasePrice
  const schedule = generateDepreciationSchedule(asset)
  const entry = schedule[year - 1]
  return entry ? entry.closingBookValue : asset.salvageValue
}

function validateUsefulLife(usefulLife: unknown): { valid: boolean; error?: string } {
  const n = Number(usefulLife)
  if (isNaN(n)) return { valid: false, error: 'Useful life must be a number' }
  if (!Number.isInteger(n)) return { valid: false, error: 'Useful life must be a whole number' }
  if (n < 1) return { valid: false, error: 'Useful life must be at least 1 year' }
  if (n > 100) return { valid: false, error: 'Useful life cannot exceed 100 years' }
  return { valid: true }
}

function generateDepreciationSchedule(asset: Asset): DepreciationEntry[] {
  const schedule: DepreciationEntry[] = []
  let bookValue = asset.purchasePrice
  let accumulated = 0

  for (let year = 1; year <= asset.usefulLife; year++) {
    const opening = bookValue
    let depreciation: number

    if (asset.method === 'STRAIGHT_LINE') {
      depreciation = calcStraightLineAnnual(asset)
    } else {
      // Declining balance: don't go below salvage value
      const maxDepreciation = bookValue - asset.salvageValue
      depreciation = Math.min(
        calcDecliningBalanceAnnual(bookValue, asset.usefulLife),
        maxDepreciation,
      )
    }

    // Ensure we never go below salvage value
    depreciation = Math.min(depreciation, bookValue - asset.salvageValue)
    depreciation = Math.max(0, depreciation)

    accumulated += depreciation
    bookValue = opening - depreciation

    schedule.push({
      year,
      openingBookValue: opening,
      depreciationAmount: depreciation,
      closingBookValue: bookValue,
      accumulatedDepreciation: accumulated,
    })
  }

  return schedule
}

function calcMonthlyDepreciation(asset: Asset): number {
  const annual = calcStraightLineAnnual(asset)
  return annual / 12
}

// ── Tests ──────────────────────────────────────────────────────────────────────

const baseAsset: Asset = {
  id: 'a1',
  storeId: 's1',
  name: 'Mesin Kasir',
  category: 'EQUIPMENT',
  purchaseDate: '2023-01-01',
  purchasePrice: 10_000_000,
  usefulLife: 5,
  method: 'STRAIGHT_LINE',
  salvageValue: 1_000_000,
  status: 'ACTIVE',
}

describe('Straight-line depreciation', () => {
  it('calculates correct annual depreciation', () => {
    const annual = calcStraightLineAnnual(baseAsset)
    expect(annual).toBe(1_800_000) // (10M - 1M) / 5
  })

  it('is constant every year in straight-line', () => {
    const schedule = generateDepreciationSchedule(baseAsset)
    const amounts = schedule.map(e => e.depreciationAmount)
    expect(amounts.every(a => Math.abs(a - 1_800_000) < 0.01)).toBe(true)
  })

  it('final book value equals salvage value', () => {
    const schedule = generateDepreciationSchedule(baseAsset)
    const last = schedule[schedule.length - 1]
    expect(last.closingBookValue).toBeCloseTo(1_000_000, 2)
  })

  it('calculates monthly depreciation', () => {
    const monthly = calcMonthlyDepreciation(baseAsset)
    expect(monthly).toBeCloseTo(150_000, 2) // 1.8M / 12
  })
})

describe('Declining balance depreciation', () => {
  const dbAsset: Asset = { ...baseAsset, method: 'DECLINING_BALANCE' }

  it('first year depreciation is higher than straight-line', () => {
    const slAnnual = calcStraightLineAnnual(baseAsset)
    const schedule = generateDepreciationSchedule(dbAsset)
    expect(schedule[0].depreciationAmount).toBeGreaterThan(slAnnual)
  })

  it('depreciation decreases each year', () => {
    const schedule = generateDepreciationSchedule(dbAsset)
    for (let i = 1; i < schedule.length - 1; i++) {
      expect(schedule[i].depreciationAmount).toBeLessThanOrEqual(schedule[i - 1].depreciationAmount)
    }
  })

  it('book value never goes below salvage value', () => {
    const schedule = generateDepreciationSchedule(dbAsset)
    schedule.forEach(e => {
      expect(e.closingBookValue).toBeGreaterThanOrEqual(dbAsset.salvageValue - 0.01)
    })
  })
})

describe('Book value at period', () => {
  it('book value at year 0 equals purchase price', () => {
    expect(calcBookValueAtYear(baseAsset, 0)).toBe(10_000_000)
  })

  it('book value at year 1 is purchase price minus one year depreciation', () => {
    expect(calcBookValueAtYear(baseAsset, 1)).toBeCloseTo(8_200_000, 2)
  })

  it('book value at final year equals salvage value', () => {
    expect(calcBookValueAtYear(baseAsset, 5)).toBeCloseTo(1_000_000, 2)
  })
})

describe('Useful life validation', () => {
  it('accepts valid useful life', () => {
    expect(validateUsefulLife(5).valid).toBe(true)
  })

  it('rejects zero', () => {
    const r = validateUsefulLife(0)
    expect(r.valid).toBe(false)
    expect(r.error).toMatch(/at least 1/)
  })

  it('rejects non-integer', () => {
    const r = validateUsefulLife(3.5)
    expect(r.valid).toBe(false)
    expect(r.error).toMatch(/whole number/)
  })

  it('rejects values over 100', () => {
    const r = validateUsefulLife(101)
    expect(r.valid).toBe(false)
    expect(r.error).toMatch(/cannot exceed/)
  })
})

describe('Depreciation schedule generation', () => {
  it('schedule has correct number of entries', () => {
    const schedule = generateDepreciationSchedule(baseAsset)
    expect(schedule).toHaveLength(5)
  })

  it('accumulated depreciation at end equals total depreciable amount', () => {
    const schedule = generateDepreciationSchedule(baseAsset)
    const last = schedule[schedule.length - 1]
    const totalDepreciable = baseAsset.purchasePrice - baseAsset.salvageValue
    expect(last.accumulatedDepreciation).toBeCloseTo(totalDepreciable, 2)
  })

  it('opening value of year N equals closing value of year N-1', () => {
    const schedule = generateDepreciationSchedule(baseAsset)
    for (let i = 1; i < schedule.length; i++) {
      expect(schedule[i].openingBookValue).toBeCloseTo(schedule[i - 1].closingBookValue, 2)
    }
  })
})
