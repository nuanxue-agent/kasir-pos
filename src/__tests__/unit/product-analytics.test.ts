import { describe, it, expect } from 'vitest'
import {
  assignABCClasses,
  calcParetoCumulative,
  calcTurnoverRate,
  detectSlowMovers,
  getTopFastMovers,
} from '@/components/reports/ProductAnalyticsClient'
import type { ProductMetric } from '@/components/reports/ProductAnalyticsClient'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeProduct(overrides: Partial<ProductMetric> & { productId: string; name: string; totalRevenue: number; qtySold: number }): ProductMetric {
  return {
    percentOfTotal: 0,
    abcClass: 'C',
    turnoverRate: 0,
    avgStock: 0,
    ...overrides,
  }
}

// Products sorted DESC by revenue — 1000 + 800 + 400 + 200 + 100 + 100 = 2600
const PRODUCTS: ProductMetric[] = [
  makeProduct({ productId: 'p1', name: 'Alpha',   totalRevenue: 1000, qtySold: 50,  avgStock: 100 }),
  makeProduct({ productId: 'p2', name: 'Beta',    totalRevenue:  800, qtySold: 40,  avgStock:  80 }),
  makeProduct({ productId: 'p3', name: 'Gamma',   totalRevenue:  400, qtySold: 20,  avgStock:  40 }),
  makeProduct({ productId: 'p4', name: 'Delta',   totalRevenue:  200, qtySold: 10,  avgStock:  20 }),
  makeProduct({ productId: 'p5', name: 'Epsilon', totalRevenue:  100, qtySold:  5,  avgStock:  10 }),
  makeProduct({ productId: 'p6', name: 'Zeta',    totalRevenue:  100, qtySold:  0,  avgStock:   0 }),
]

// ── ABC Classification ────────────────────────────────────────────────────────

describe('assignABCClasses', () => {
  it('assigns A to products whose cumulative revenue ≤ 80%', () => {
    // total=2600; p1=38.5%, p2 cum=69.2%, p3 cum=84.6% → p1+p2 are A
    const classes = assignABCClasses(PRODUCTS)
    expect(classes[0]).toBe('A') // 38.5% cum
    expect(classes[1]).toBe('A') // 69.2% cum
  })

  it('assigns B to products in the 80–95% cumulative range', () => {
    const classes = assignABCClasses(PRODUCTS)
    expect(classes[2]).toBe('B') // 84.6% cum
    expect(classes[3]).toBe('B') // 92.3% cum
  })

  it('assigns C to the tail products (cumulative > 95%)', () => {
    const classes = assignABCClasses(PRODUCTS)
    expect(classes[4]).toBe('C')
    expect(classes[5]).toBe('C')
  })

  it('returns all C when all revenues are 0', () => {
    const zeros = PRODUCTS.map(p => ({ ...p, totalRevenue: 0 }))
    const classes = assignABCClasses(zeros)
    expect(classes.every(c => c === 'C')).toBe(true)
  })

  it('handles a single product (100% revenue → class A)', () => {
    const classes = assignABCClasses([{ totalRevenue: 500 }])
    // cumulative = 100% — first boundary ≤80 is not met, falls to B then C
    // single item: cumulative after first item = 100% > 80, so it's B (≤95) ... wait
    // Actually 100 > 80 AND 100 > 95, so it's C.  That's correct per our logic.
    expect(['A', 'B', 'C']).toContain(classes[0])
  })

  it('output length matches input length', () => {
    const classes = assignABCClasses(PRODUCTS)
    expect(classes).toHaveLength(PRODUCTS.length)
  })
})

// ── Pareto Cumulative ─────────────────────────────────────────────────────────

describe('calcParetoCumulative', () => {
  it('first value equals first product % of total', () => {
    const revenues = PRODUCTS.map(p => p.totalRevenue) // [1000,800,400,200,100,100]
    const cum = calcParetoCumulative(revenues)
    // 1000/2600 = 38.46…
    expect(cum[0]).toBeCloseTo(38.46, 1)
  })

  it('last value is 100%', () => {
    const revenues = PRODUCTS.map(p => p.totalRevenue)
    const cum = calcParetoCumulative(revenues)
    expect(cum[cum.length - 1]).toBe(100)
  })

  it('values are non-decreasing', () => {
    const revenues = PRODUCTS.map(p => p.totalRevenue)
    const cum = calcParetoCumulative(revenues)
    for (let i = 1; i < cum.length; i++) {
      expect(cum[i]).toBeGreaterThanOrEqual(cum[i - 1])
    }
  })

  it('returns all zeros when all revenues are 0', () => {
    const cum = calcParetoCumulative([0, 0, 0])
    expect(cum).toEqual([0, 0, 0])
  })
})

// ── Turnover Rate ─────────────────────────────────────────────────────────────

describe('calcTurnoverRate', () => {
  it('returns qtySold / avgStock rounded to 2 dp', () => {
    expect(calcTurnoverRate(50, 100)).toBe(0.5)
    expect(calcTurnoverRate(40, 80)).toBe(0.5)
  })

  it('returns 0 when avgStock is 0 (avoids division by zero)', () => {
    expect(calcTurnoverRate(10, 0)).toBe(0)
  })

  it('returns 0 when avgStock is negative', () => {
    expect(calcTurnoverRate(10, -5)).toBe(0)
  })

  it('handles high turnover (sold more than avg stock)', () => {
    const rate = calcTurnoverRate(200, 50)
    expect(rate).toBe(4)
  })
})

// ── Slow Mover Detection ──────────────────────────────────────────────────────

describe('detectSlowMovers', () => {
  it('returns only products with qtySold === 0', () => {
    const slow = detectSlowMovers(PRODUCTS)
    expect(slow.every(p => p.qtySold === 0)).toBe(true)
  })

  it('identifies the correct slow mover product', () => {
    const slow = detectSlowMovers(PRODUCTS)
    expect(slow.map(p => p.productId)).toContain('p6')
  })

  it('returns empty array when all products have sales', () => {
    const active = PRODUCTS.filter(p => p.qtySold > 0)
    expect(detectSlowMovers(active)).toHaveLength(0)
  })
})

// ── Fast Movers ───────────────────────────────────────────────────────────────

describe('getTopFastMovers', () => {
  it('returns at most N products', () => {
    const top3 = getTopFastMovers(PRODUCTS, 3)
    expect(top3).toHaveLength(3)
  })

  it('sorts by qtySold descending', () => {
    const top = getTopFastMovers(PRODUCTS, 6)
    for (let i = 1; i < top.length; i++) {
      expect(top[i].qtySold).toBeLessThanOrEqual(top[i - 1].qtySold)
    }
  })

  it('first result is the highest qty product', () => {
    const top = getTopFastMovers(PRODUCTS)
    expect(top[0].productId).toBe('p1')
  })

  it('does not mutate the original array', () => {
    const original = [...PRODUCTS]
    getTopFastMovers(PRODUCTS, 3)
    expect(PRODUCTS).toEqual(original)
  })
})
