import { describe, it, expect } from 'vitest'
import {
  calcOverallScore,
  calcBadge,
  rankEntries,
  calcSalesScore,
  calcAttendanceScore,
  calcCustomerScore,
  aggregatePeriodScores,
  normalizeScore,
  DEFAULT_WEIGHTS,
} from '@/lib/performance-score'
import type { BadgeTier } from '@/lib/performance-score'

// ─── 1. Weighted score calculation ──────────────────────────────────────────

describe('calcOverallScore', () => {
  it('computes weighted average with default weights (40/35/25)', () => {
    // 80*0.4 + 90*0.35 + 70*0.25 = 32 + 31.5 + 17.5 = 81
    expect(calcOverallScore({ salesScore: 80, attendanceScore: 90, customerScore: 70 })).toBe(81)
  })

  it('returns 100 when all components are perfect', () => {
    expect(calcOverallScore({ salesScore: 100, attendanceScore: 100, customerScore: 100 })).toBe(100)
  })

  it('returns 0 when all components are zero', () => {
    expect(calcOverallScore({ salesScore: 0, attendanceScore: 0, customerScore: 0 })).toBe(0)
  })

  it('respects custom weights', () => {
    // Equal thirds: 60*0.33 + 60*0.33 + 60*0.34 = ~60
    const weights = { sales: 1 / 3, attendance: 1 / 3, customer: 1 / 3 }
    expect(calcOverallScore({ salesScore: 60, attendanceScore: 60, customerScore: 60 }, weights)).toBe(60)
  })

  it('clamps component above 100 before weighting', () => {
    // salesScore 150 is clamped to 100
    expect(calcOverallScore({ salesScore: 150, attendanceScore: 0, customerScore: 0 })).toBe(40)
  })
})

// ─── 2. Score normalization ──────────────────────────────────────────────────

describe('normalizeScore', () => {
  it('clamps value above 100 to 100', () => {
    expect(normalizeScore(120)).toBe(100)
  })

  it('clamps negative value to 0', () => {
    expect(normalizeScore(-10)).toBe(0)
  })

  it('passes through values within range unchanged', () => {
    expect(normalizeScore(0)).toBe(0)
    expect(normalizeScore(50)).toBe(50)
    expect(normalizeScore(100)).toBe(100)
  })
})

// ─── 3. Badge assignment thresholds ─────────────────────────────────────────

describe('calcBadge', () => {
  const cases: Array<[number, BadgeTier]> = [
    [100, 'PLATINUM'],
    [90,  'PLATINUM'],
    [89,  'GOLD'],
    [75,  'GOLD'],
    [74,  'SILVER'],
    [60,  'SILVER'],
    [59,  'BRONZE'],
    [0,   'BRONZE'],
  ]

  it.each(cases)('score %i → %s', (score, expected) => {
    expect(calcBadge(score)).toBe(expected)
  })

  it('handles boundary at 90 as PLATINUM', () => {
    expect(calcBadge(90)).toBe('PLATINUM')
    expect(calcBadge(89)).toBe('GOLD')
  })

  it('handles boundary at 60 as SILVER', () => {
    expect(calcBadge(60)).toBe('SILVER')
    expect(calcBadge(59)).toBe('BRONZE')
  })
})

// ─── 4. Rank determination ───────────────────────────────────────────────────

describe('rankEntries', () => {
  it('assigns rank 1 to highest overall score', () => {
    const entries = [
      { employeeId: 'e1', overallScore: 70, salesScore: 70 },
      { employeeId: 'e2', overallScore: 90, salesScore: 80 },
      { employeeId: 'e3', overallScore: 80, salesScore: 75 },
    ]
    const ranked = rankEntries(entries)
    expect(ranked.find(r => r.employeeId === 'e2')?.rank).toBe(1)
    expect(ranked.find(r => r.employeeId === 'e3')?.rank).toBe(2)
    expect(ranked.find(r => r.employeeId === 'e1')?.rank).toBe(3)
  })

  it('uses salesScore as tie-breaker for equal overallScore', () => {
    const entries = [
      { employeeId: 'e1', overallScore: 80, salesScore: 60 },
      { employeeId: 'e2', overallScore: 80, salesScore: 90 },
    ]
    const ranked = rankEntries(entries)
    expect(ranked.find(r => r.employeeId === 'e2')?.rank).toBe(1)
    expect(ranked.find(r => r.employeeId === 'e1')?.rank).toBe(2)
  })

  it('assigns sequential ranks starting at 1', () => {
    const entries = [
      { employeeId: 'e1', overallScore: 50, salesScore: 50 },
      { employeeId: 'e2', overallScore: 70, salesScore: 70 },
      { employeeId: 'e3', overallScore: 90, salesScore: 90 },
    ]
    const ranked = rankEntries(entries)
    const ranks = ranked.map(r => r.rank).sort((a, b) => a - b)
    expect(ranks).toEqual([1, 2, 3])
  })

  it('returns empty array for empty input', () => {
    expect(rankEntries([])).toEqual([])
  })
})

// ─── 5. Component score helpers ──────────────────────────────────────────────

describe('calcSalesScore', () => {
  it('returns 100 when actual meets target', () => {
    expect(calcSalesScore(1000, 1000)).toBe(100)
  })

  it('returns proportional score when below target', () => {
    expect(calcSalesScore(500, 1000)).toBe(50)
  })

  it('caps at 100 when actual exceeds target', () => {
    expect(calcSalesScore(1500, 1000)).toBe(100)
  })

  it('returns 0 when target is zero', () => {
    expect(calcSalesScore(500, 0)).toBe(0)
  })
})

describe('calcAttendanceScore', () => {
  it('returns 100 for perfect attendance', () => {
    expect(calcAttendanceScore(22, 22)).toBe(100)
  })

  it('returns proportional score', () => {
    expect(calcAttendanceScore(11, 22)).toBe(50)
  })

  it('returns 0 for zero working days', () => {
    expect(calcAttendanceScore(0, 0)).toBe(0)
  })
})

describe('calcCustomerScore', () => {
  it('maps rating 5 to 100', () => {
    expect(calcCustomerScore(5)).toBe(100)
  })

  it('maps rating 1 to 0', () => {
    expect(calcCustomerScore(1)).toBe(0)
  })

  it('maps rating 3 to 50', () => {
    expect(calcCustomerScore(3)).toBe(50)
  })
})

// ─── 6. Period aggregation ───────────────────────────────────────────────────

describe('aggregatePeriodScores', () => {
  it('returns average of all period scores', () => {
    const entries = [
      { period: '2025-01', overallScore: 80 },
      { period: '2025-02', overallScore: 90 },
      { period: '2025-03', overallScore: 70 },
    ]
    expect(aggregatePeriodScores(entries)).toBe(80)
  })

  it('returns 0 for empty array', () => {
    expect(aggregatePeriodScores([])).toBe(0)
  })

  it('returns single score for single entry', () => {
    expect(aggregatePeriodScores([{ period: '2025-01', overallScore: 85 }])).toBe(85)
  })

  it('rounds to nearest integer', () => {
    const entries = [
      { period: '2025-01', overallScore: 80 },
      { period: '2025-02', overallScore: 81 },
    ]
    expect(aggregatePeriodScores(entries)).toBe(81) // 80.5 rounds to 81
  })
})
