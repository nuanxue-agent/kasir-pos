import { describe, it, expect } from 'vitest'
import {
  calcExpectedCash,
  calcVariance,
  aggregateByType,
  totalByType,
  buildEODReport,
  hasVariance,
  movementEffect,
  varianceLabel,
  type CashMovement,
  type CashDrawer,
} from '@/lib/cash-drawer'

const makeMovement = (
  type: CashMovement['type'],
  amount: number,
  id = Math.random().toString(36).slice(2),
): CashMovement => ({
  id,
  drawerId: 'drawer-1',
  storeId: 'store-1',
  type,
  amount,
  reference: null,
  note: null,
  createdAt: '2026-07-28T08:00:00.000Z',
})

const baseDrawer: CashDrawer = {
  id: 'drawer-1',
  storeId: 'store-1',
  openedAt: '2026-07-28T08:00:00.000Z',
  openingFloat: 500_000,
  expectedCash: 0,
  actualCash: 0,
  variance: 0,
  status: 'OPEN',
}

// ─── 1. Movement effects ────────────────────────────────────────────────────
describe('movementEffect', () => {
  it('SALE adds to drawer (+1)', () => {
    expect(movementEffect('SALE')).toBe(1)
  })

  it('FLOAT_ADD adds to drawer (+1)', () => {
    expect(movementEffect('FLOAT_ADD')).toBe(1)
  })

  it('REFUND removes from drawer (-1)', () => {
    expect(movementEffect('REFUND')).toBe(-1)
  })

  it('PAYOUT removes from drawer (-1)', () => {
    expect(movementEffect('PAYOUT')).toBe(-1)
  })
})

// ─── 2. Expected cash calculation ───────────────────────────────────────────
describe('calcExpectedCash', () => {
  it('returns opening float when no movements', () => {
    expect(calcExpectedCash(500_000, [])).toBe(500_000)
  })

  it('adds sales to opening float', () => {
    const movements = [makeMovement('SALE', 200_000), makeMovement('SALE', 100_000)]
    expect(calcExpectedCash(500_000, movements)).toBe(800_000)
  })

  it('subtracts refunds from expected cash', () => {
    const movements = [makeMovement('SALE', 300_000), makeMovement('REFUND', 50_000)]
    expect(calcExpectedCash(500_000, movements)).toBe(750_000)
  })

  it('subtracts payouts from expected cash', () => {
    const movements = [makeMovement('SALE', 200_000), makeMovement('PAYOUT', 75_000)]
    expect(calcExpectedCash(500_000, movements)).toBe(625_000)
  })

  it('adds float additions to expected cash', () => {
    const movements = [makeMovement('FLOAT_ADD', 100_000)]
    expect(calcExpectedCash(500_000, movements)).toBe(600_000)
  })

  it('handles mixed movement types correctly', () => {
    const movements = [
      makeMovement('SALE', 400_000),
      makeMovement('REFUND', 30_000),
      makeMovement('PAYOUT', 20_000),
      makeMovement('FLOAT_ADD', 50_000),
    ]
    // 500k + 400k - 30k - 20k + 50k = 900k
    expect(calcExpectedCash(500_000, movements)).toBe(900_000)
  })
})

// ─── 3. Variance detection ──────────────────────────────────────────────────
describe('calcVariance', () => {
  it('returns 0 when actual equals expected (balanced)', () => {
    expect(calcVariance(750_000, 750_000)).toBe(0)
  })

  it('returns positive variance when actual exceeds expected (surplus)', () => {
    expect(calcVariance(750_000, 760_000)).toBe(10_000)
  })

  it('returns negative variance when actual is less than expected (shortage)', () => {
    expect(calcVariance(750_000, 740_000)).toBe(-10_000)
  })
})

describe('hasVariance', () => {
  it('returns false when balanced', () => {
    expect(hasVariance(0)).toBe(false)
  })

  it('returns true for positive variance', () => {
    expect(hasVariance(5_000)).toBe(true)
  })

  it('returns true for negative variance', () => {
    expect(hasVariance(-5_000)).toBe(true)
  })

  it('respects tolerance threshold', () => {
    expect(hasVariance(500, 1_000)).toBe(false)
    expect(hasVariance(1_500, 1_000)).toBe(true)
  })
})

// ─── 4. Movement type aggregation ───────────────────────────────────────────
describe('aggregateByType', () => {
  it('returns zeros for all types with no movements', () => {
    const agg = aggregateByType([])
    expect(agg.SALE).toBe(0)
    expect(agg.REFUND).toBe(0)
    expect(agg.PAYOUT).toBe(0)
    expect(agg.FLOAT_ADD).toBe(0)
  })

  it('aggregates each type independently', () => {
    const movements = [
      makeMovement('SALE', 100_000),
      makeMovement('SALE', 200_000),
      makeMovement('REFUND', 50_000),
      makeMovement('PAYOUT', 25_000),
      makeMovement('FLOAT_ADD', 75_000),
    ]
    const agg = aggregateByType(movements)
    expect(agg.SALE).toBe(300_000)
    expect(agg.REFUND).toBe(50_000)
    expect(agg.PAYOUT).toBe(25_000)
    expect(agg.FLOAT_ADD).toBe(75_000)
  })
})

describe('totalByType', () => {
  it('totals only the requested type', () => {
    const movements = [
      makeMovement('SALE', 100_000),
      makeMovement('REFUND', 30_000),
      makeMovement('PAYOUT', 20_000),
    ]
    expect(totalByType(movements, 'SALE')).toBe(100_000)
    expect(totalByType(movements, 'REFUND')).toBe(30_000)
    expect(totalByType(movements, 'PAYOUT')).toBe(20_000)
    expect(totalByType(movements, 'FLOAT_ADD')).toBe(0)
  })
})

// ─── 5. Payout tracking ─────────────────────────────────────────────────────
describe('payout tracking', () => {
  it('accumulates multiple payouts correctly', () => {
    const movements = [
      makeMovement('PAYOUT', 10_000),
      makeMovement('PAYOUT', 15_000),
      makeMovement('PAYOUT', 5_000),
    ]
    expect(totalByType(movements, 'PAYOUT')).toBe(30_000)
  })

  it('payouts reduce expected cash', () => {
    const movements = [
      makeMovement('SALE', 500_000),
      makeMovement('PAYOUT', 100_000),
      makeMovement('PAYOUT', 50_000),
    ]
    // 500k + 500k - 150k = 850k
    expect(calcExpectedCash(500_000, movements)).toBe(850_000)
  })
})

// ─── 6. EOD report totals ────────────────────────────────────────────────────
describe('buildEODReport', () => {
  it('builds correct EOD report for a closed drawer', () => {
    const movements: CashMovement[] = [
      makeMovement('SALE', 400_000),
      makeMovement('SALE', 200_000),
      makeMovement('REFUND', 50_000),
      makeMovement('PAYOUT', 25_000),
      makeMovement('FLOAT_ADD', 100_000),
    ]
    // expected = 500k + 400k + 200k - 50k - 25k + 100k = 1_125_000
    const drawer: CashDrawer = {
      ...baseDrawer,
      openingFloat: 500_000,
      actualCash: 1_110_000,
      expectedCash: 1_125_000,
      variance: -15_000,
      status: 'CLOSED',
      closedAt: '2026-07-28T20:00:00.000Z',
    }
    const report = buildEODReport(drawer, movements)
    expect(report.totalSales).toBe(600_000)
    expect(report.totalRefunds).toBe(50_000)
    expect(report.totalPayouts).toBe(25_000)
    expect(report.totalFloatAdds).toBe(100_000)
    expect(report.expectedCash).toBe(1_125_000)
    expect(report.actualCash).toBe(1_110_000)
    expect(report.variance).toBe(-15_000)
    expect(report.movementCount).toBe(5)
    expect(report.status).toBe('CLOSED')
  })

  it('returns zero actual cash and expected variance for an open drawer', () => {
    const movements = [makeMovement('SALE', 200_000)]
    const report = buildEODReport(baseDrawer, movements)
    expect(report.actualCash).toBe(0)
    expect(report.expectedCash).toBe(700_000)
    expect(report.status).toBe('OPEN')
  })
})

// ─── 7. Variance label ───────────────────────────────────────────────────────
describe('varianceLabel', () => {
  it('labels balanced drawer', () => {
    expect(varianceLabel(0)).toBe('Seimbang')
  })

  it('labels surplus drawer', () => {
    expect(varianceLabel(10_000)).toContain('Surplus')
  })

  it('labels shortage drawer', () => {
    expect(varianceLabel(-5_000)).toContain('Kekurangan')
  })
})
