import { describe, it, expect } from 'vitest'
import {
  detectSpikes,
  detectDips,
  calcTrendDirection,
  detectTrend,
  detectMilestones,
  detectLowStock,
  type DailyRevenue,
  type StockItem,
  type MilestoneGoal,
} from '@/lib/insights-detection'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeDays(revenues: number[], startDate = '2024-01-01'): DailyRevenue[] {
  return revenues.map((revenue, i) => {
    const d = new Date(startDate)
    d.setDate(d.getDate() + i)
    return {
      date: d.toISOString().slice(0, 10),
      revenue,
      orderCount: Math.ceil(revenue / 50_000),
    }
  })
}

// ─── 1. Spike detection ───────────────────────────────────────────────────────

describe('detectSpikes', () => {
  it('detects a day with revenue >= 2x the 7-day rolling average', () => {
    // First 7 days avg = 100_000, day 8 = 250_000 (2.5x)
    const days = makeDays([100_000, 100_000, 100_000, 100_000, 100_000, 100_000, 100_000, 250_000])
    const spikes = detectSpikes(days)
    expect(spikes.length).toBeGreaterThanOrEqual(1)
    expect(spikes[0].type).toBe('SPIKE')
    expect(spikes[0].data.ratio as number).toBeGreaterThanOrEqual(2)
  })

  it('does not flag days below the 2x threshold', () => {
    // Day 8 = 180_000, avg = 100_000 → 1.8x (below threshold)
    const days = makeDays([100_000, 100_000, 100_000, 100_000, 100_000, 100_000, 100_000, 180_000])
    const spikes = detectSpikes(days)
    expect(spikes).toHaveLength(0)
  })

  it('assigns CRITICAL severity for spikes >= 3x average', () => {
    const days = makeDays([100_000, 100_000, 100_000, 100_000, 100_000, 100_000, 100_000, 350_000])
    const spikes = detectSpikes(days)
    expect(spikes[0].severity).toBe('CRITICAL')
  })

  it('assigns WARNING severity for spikes between 2x and 3x', () => {
    const days = makeDays([100_000, 100_000, 100_000, 100_000, 100_000, 100_000, 100_000, 250_000])
    const spikes = detectSpikes(days)
    expect(spikes[0].severity).toBe('WARNING')
  })

  it('returns empty array when fewer than 2 data points', () => {
    expect(detectSpikes([])).toHaveLength(0)
    expect(detectSpikes(makeDays([100_000]))).toHaveLength(0)
  })
})

// ─── 2. Dip detection ────────────────────────────────────────────────────────

describe('detectDips', () => {
  it('detects a day with revenue <= 50% of the 7-day rolling average', () => {
    // avg = 200_000, day 8 = 80_000 (40% → below 50%)
    const days = makeDays([200_000, 200_000, 200_000, 200_000, 200_000, 200_000, 200_000, 80_000])
    const dips = detectDips(days)
    expect(dips.length).toBeGreaterThanOrEqual(1)
    expect(dips[0].type).toBe('DIP')
    expect(dips[0].data.ratio as number).toBeLessThanOrEqual(0.5)
  })

  it('does not flag days above the 50% threshold', () => {
    // Day 8 = 120_000 (60% of avg 200_000 — above threshold)
    const days = makeDays([200_000, 200_000, 200_000, 200_000, 200_000, 200_000, 200_000, 120_000])
    const dips = detectDips(days)
    expect(dips).toHaveLength(0)
  })

  it('assigns CRITICAL severity when revenue is <= 20% of average', () => {
    const days = makeDays([200_000, 200_000, 200_000, 200_000, 200_000, 200_000, 200_000, 30_000])
    const dips = detectDips(days)
    expect(dips[0].severity).toBe('CRITICAL')
  })

  it('assigns WARNING severity for dips between 20% and 50%', () => {
    const days = makeDays([200_000, 200_000, 200_000, 200_000, 200_000, 200_000, 200_000, 80_000])
    const dips = detectDips(days)
    expect(dips[0].severity).toBe('WARNING')
  })
})

// ─── 3. Trend direction calculation ──────────────────────────────────────────

describe('calcTrendDirection', () => {
  it('returns UP for steadily increasing revenue', () => {
    const days = makeDays([100_000, 120_000, 140_000, 160_000, 180_000, 200_000, 220_000])
    expect(calcTrendDirection(days)).toBe('UP')
  })

  it('returns DOWN for steadily declining revenue', () => {
    const days = makeDays([220_000, 200_000, 180_000, 160_000, 140_000, 120_000, 100_000])
    expect(calcTrendDirection(days)).toBe('DOWN')
  })

  it('returns FLAT for stable revenue within threshold', () => {
    // Very small variation — slope within ±5% threshold
    const days = makeDays([100_000, 101_000, 100_500, 99_500, 100_200, 99_800, 100_100])
    expect(calcTrendDirection(days)).toBe('FLAT')
  })

  it('returns FLAT for fewer than 2 data points', () => {
    expect(calcTrendDirection([])).toBe('FLAT')
    expect(calcTrendDirection(makeDays([100_000]))).toBe('FLAT')
  })
})

// ─── 4. Trend insight generation ─────────────────────────────────────────────

describe('detectTrend', () => {
  it('generates a TREND insight for upward movement', () => {
    const days = makeDays([100_000, 120_000, 140_000, 160_000, 180_000, 200_000, 220_000])
    const insight = detectTrend(days)
    expect(insight).not.toBeNull()
    expect(insight!.type).toBe('TREND')
    expect(insight!.data.direction).toBe('UP')
  })

  it('generates WARNING severity for a >10% downward trend', () => {
    const days = makeDays([220_000, 200_000, 180_000, 160_000, 140_000, 120_000, 100_000])
    const insight = detectTrend(days)
    expect(insight).not.toBeNull()
    const sev = insight!.severity
    expect(['WARNING', 'CRITICAL']).toContain(sev)
  })

  it('returns null for fewer than 4 data points', () => {
    expect(detectTrend(makeDays([100_000, 110_000, 120_000]))).toBeNull()
  })
})

// ─── 5. Milestone detection ───────────────────────────────────────────────────

describe('detectMilestones', () => {
  const goals: MilestoneGoal[] = [
    { id: 'g1', label: 'Rp 10 Juta', targetRevenue: 10_000_000 },
    { id: 'g2', label: 'Rp 50 Juta', targetRevenue: 50_000_000 },
  ]

  it('detects milestone when cumulative revenue meets the target', () => {
    const insights = detectMilestones(10_000_000, goals)
    expect(insights.length).toBeGreaterThanOrEqual(1)
    expect(insights[0].type).toBe('MILESTONE')
    expect(insights[0].data.goalId).toBe('g1')
  })

  it('detects multiple milestones when revenue exceeds several targets', () => {
    const insights = detectMilestones(55_000_000, goals)
    expect(insights).toHaveLength(2)
  })

  it('does not trigger milestone when revenue is below target', () => {
    const insights = detectMilestones(9_000_000, goals)
    expect(insights).toHaveLength(0)
  })

  it('milestone insights always have INFO severity', () => {
    const insights = detectMilestones(100_000_000, goals)
    insights.forEach(i => expect(i.severity).toBe('INFO'))
  })
})

// ─── 6. Low stock threshold check ────────────────────────────────────────────

describe('detectLowStock', () => {
  it('detects products below reorder point', () => {
    const products: StockItem[] = [
      { id: 'p1', name: 'Kopi Arabica', stock: 5, reorderPoint: 20 },
      { id: 'p2', name: 'Teh Hijau', stock: 25, reorderPoint: 20 }, // OK
    ]
    const insights = detectLowStock(products)
    expect(insights).toHaveLength(1)
    expect(insights[0].type).toBe('LOW_STOCK')
    expect(insights[0].data.productId).toBe('p1')
  })

  it('assigns CRITICAL severity for zero-stock items', () => {
    const products: StockItem[] = [{ id: 'p1', name: 'Gula', stock: 0, reorderPoint: 10 }]
    const [insight] = detectLowStock(products)
    expect(insight.severity).toBe('CRITICAL')
  })

  it('assigns WARNING severity for stock between 1 and 3', () => {
    const products: StockItem[] = [{ id: 'p1', name: 'Tepung', stock: 2, reorderPoint: 10 }]
    const [insight] = detectLowStock(products)
    expect(insight.severity).toBe('WARNING')
  })

  it('assigns INFO severity for stock > 3 but below reorder point', () => {
    const products: StockItem[] = [{ id: 'p1', name: 'Mentega', stock: 8, reorderPoint: 20 }]
    const [insight] = detectLowStock(products)
    expect(insight.severity).toBe('INFO')
  })

  it('returns empty array when all products are at or above reorder point', () => {
    const products: StockItem[] = [
      { id: 'p1', name: 'Salt', stock: 10, reorderPoint: 10 },
      { id: 'p2', name: 'Pepper', stock: 15, reorderPoint: 10 },
    ]
    expect(detectLowStock(products)).toHaveLength(0)
  })
})
