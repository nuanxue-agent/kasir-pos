import { describe, it, expect } from 'vitest'

// ── Types ─────────────────────────────────────────────────────────────────────

type DepreciationMethod = 'STRAIGHT_LINE' | 'DECLINING_BALANCE'
type AssetStatus = 'ACTIVE' | 'DISPOSED' | 'FULLY_DEPRECIATED'

interface FixedAsset {
  id: string
  storeId: string
  name: string
  purchasePrice: number
  residualValue: number
  usefulLifeYears: number
  depreciationMethod: DepreciationMethod
  currentBookValue: number
  status: AssetStatus
}

// ── Pure business-logic functions (mirrors API logic) ─────────────────────────

function calcMonthlyDepreciation(
  currentBookValue: number,
  purchasePrice: number,
  residualValue: number,
  usefulLifeYears: number,
  method: DepreciationMethod
): number {
  if (method === 'STRAIGHT_LINE') {
    return (purchasePrice - residualValue) / (usefulLifeYears * 12)
  }
  const annualRate = 1 / usefulLifeYears
  return (currentBookValue * annualRate) / 12
}

function calcBookValueAfterDepreciation(
  currentBookValue: number,
  depreciationAmount: number,
  residualValue: number
): number {
  return Math.max(residualValue, currentBookValue - depreciationAmount)
}

function isFullyDepreciated(currentBookValue: number, residualValue: number): boolean {
  return currentBookValue <= residualValue + 0.001
}

function calcDisposalGainLoss(disposalProceeds: number, bookValueAtDisposal: number): number {
  return disposalProceeds - bookValueAtDisposal
}

function calcDepreciationSchedule(
  purchasePrice: number,
  residualValue: number,
  usefulLifeYears: number,
  method: DepreciationMethod
): Array<{ month: number; amount: number; bookValueAfter: number }> {
  const totalMonths = usefulLifeYears * 12
  const schedule: Array<{ month: number; amount: number; bookValueAfter: number }> = []
  let currentBV = purchasePrice

  for (let m = 1; m <= totalMonths; m++) {
    let amount = calcMonthlyDepreciation(currentBV, purchasePrice, residualValue, usefulLifeYears, method)
    const floor = currentBV - residualValue
    if (amount > floor) amount = floor
    const bookValueAfter = calcBookValueAfterDepreciation(currentBV, amount, residualValue)
    schedule.push({ month: m, amount, bookValueAfter })
    currentBV = bookValueAfter
    if (isFullyDepreciated(currentBV, residualValue)) break
  }
  return schedule
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeAsset(overrides: Partial<FixedAsset> = {}): FixedAsset {
  return {
    id: 'asset-1',
    storeId: 'store-1',
    name: 'Laptop',
    purchasePrice: 12_000_000,
    residualValue: 0,
    usefulLifeYears: 4,
    depreciationMethod: 'STRAIGHT_LINE',
    currentBookValue: 12_000_000,
    status: 'ACTIVE',
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Straight-line depreciation calculation', () => {
  it('calculates correct monthly amount with zero residual', () => {
    // 12_000_000 / (4 * 12) = 250_000
    const amount = calcMonthlyDepreciation(12_000_000, 12_000_000, 0, 4, 'STRAIGHT_LINE')
    expect(amount).toBeCloseTo(250_000, 0)
  })

  it('calculates correct monthly amount with non-zero residual value', () => {
    // (12_000_000 - 2_000_000) / (4 * 12) = 208_333.33
    const amount = calcMonthlyDepreciation(12_000_000, 12_000_000, 2_000_000, 4, 'STRAIGHT_LINE')
    expect(amount).toBeCloseTo(208_333.33, 0)
  })

  it('straight-line amount is constant regardless of current book value', () => {
    const asset = makeAsset()
    const firstMonth = calcMonthlyDepreciation(
      asset.currentBookValue, asset.purchasePrice, asset.residualValue, asset.usefulLifeYears, 'STRAIGHT_LINE'
    )
    const halfwayBV = asset.purchasePrice / 2
    const midMonth = calcMonthlyDepreciation(
      halfwayBV, asset.purchasePrice, asset.residualValue, asset.usefulLifeYears, 'STRAIGHT_LINE'
    )
    expect(firstMonth).toBeCloseTo(midMonth, 5)
  })
})

describe('Declining balance depreciation calculation', () => {
  it('calculates correct first monthly amount', () => {
    // rate = 1/4 = 0.25 annually; monthly = 12_000_000 * 0.25 / 12 = 250_000
    const amount = calcMonthlyDepreciation(12_000_000, 12_000_000, 0, 4, 'DECLINING_BALANCE')
    expect(amount).toBeCloseTo(250_000, 0)
  })

  it('declining balance amount decreases as book value falls', () => {
    const firstMonth = calcMonthlyDepreciation(12_000_000, 12_000_000, 0, 4, 'DECLINING_BALANCE')
    const laterBV = 6_000_000
    const laterMonth = calcMonthlyDepreciation(laterBV, 12_000_000, 0, 4, 'DECLINING_BALANCE')
    expect(laterMonth).toBeLessThan(firstMonth)
    expect(laterMonth).toBeCloseTo(125_000, 0)
  })

  it('declining balance uses current book value, not purchase price', () => {
    const bv = 3_000_000
    const amount = calcMonthlyDepreciation(bv, 12_000_000, 0, 4, 'DECLINING_BALANCE')
    // 3_000_000 * (1/4) / 12 = 62_500
    expect(amount).toBeCloseTo(62_500, 0)
  })
})

describe('Book value after depreciation', () => {
  it('reduces book value by depreciation amount', () => {
    const newBV = calcBookValueAfterDepreciation(12_000_000, 250_000, 0)
    expect(newBV).toBe(11_750_000)
  })

  it('never falls below residual value', () => {
    // Attempt to depreciate more than remaining depreciable amount
    const newBV = calcBookValueAfterDepreciation(2_100_000, 500_000, 2_000_000)
    expect(newBV).toBe(2_000_000)
  })

  it('equals residual value exactly when fully depreciated', () => {
    const newBV = calcBookValueAfterDepreciation(250_000, 250_000, 0)
    expect(newBV).toBe(0)
  })
})

describe('Useful life end detection', () => {
  it('detects asset at residual value as fully depreciated', () => {
    expect(isFullyDepreciated(0, 0)).toBe(true)
  })

  it('detects asset at non-zero residual value as fully depreciated', () => {
    expect(isFullyDepreciated(2_000_000, 2_000_000)).toBe(true)
  })

  it('does not flag asset above residual value as fully depreciated', () => {
    expect(isFullyDepreciated(2_000_001, 2_000_000)).toBe(false)
  })

  it('depreciation schedule terminates at useful life end', () => {
    const schedule = calcDepreciationSchedule(12_000_000, 0, 4, 'STRAIGHT_LINE')
    expect(schedule.length).toBe(48) // 4 years * 12 months
    expect(schedule[schedule.length - 1].bookValueAfter).toBeCloseTo(0, 0)
  })
})

describe('Disposal gain/loss calculation', () => {
  it('calculates gain when proceeds exceed book value', () => {
    const gainLoss = calcDisposalGainLoss(5_000_000, 3_000_000)
    expect(gainLoss).toBe(2_000_000)
  })

  it('calculates loss when proceeds are below book value', () => {
    const gainLoss = calcDisposalGainLoss(1_000_000, 4_000_000)
    expect(gainLoss).toBe(-3_000_000)
  })

  it('calculates zero gain/loss when proceeds equal book value', () => {
    const gainLoss = calcDisposalGainLoss(3_000_000, 3_000_000)
    expect(gainLoss).toBe(0)
  })
})
