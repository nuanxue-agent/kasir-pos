import { describe, it, expect } from 'vitest'
import {
  calcOverallScore,
  validateScores,
  isValidScore,
  rankVendorsBySore,
  detectScoreTrend,
  selectPreferredVendors,
  buildVendorScorecard,
} from '@/lib/vendor-evaluation'
import type { VendorEvaluation, VendorScorecard, ScoreTrend } from '@/lib/vendor-evaluation'

// ─── helpers ────────────────────────────────────────────────────────────────

function makeEval(overrides: Partial<VendorEvaluation> = {}): VendorEvaluation {
  return {
    id: 'e1',
    storeId: 's1',
    vendorId: 'v1',
    deliveryScore: 4,
    qualityScore: 4,
    priceScore: 4,
    communicationScore: 4,
    overallScore: 4,
    evaluatedAt: new Date().toISOString(),
    ...overrides,
  }
}

function makeScorecard(overrides: Partial<VendorScorecard> = {}): VendorScorecard {
  return {
    vendorId: 'v1',
    vendorName: 'Vendor A',
    avgDelivery: 4,
    avgQuality: 4,
    avgPrice: 4,
    avgCommunication: 4,
    avgOverall: 4,
    evaluationCount: 3,
    trend: 'stable',
    isPreferred: true,
    ...overrides,
  }
}

// ─── Overall score calculation ───────────────────────────────────────────────

describe('calcOverallScore', () => {
  it('returns average of all four scores', () => {
    expect(calcOverallScore(4, 4, 4, 4)).toBe(4)
  })

  it('rounds to 2 decimal places', () => {
    // (5 + 4 + 3 + 4) / 4 = 4.0
    expect(calcOverallScore(5, 4, 3, 4)).toBe(4)
    // (5 + 3 + 3 + 4) / 4 = 3.75
    expect(calcOverallScore(5, 3, 3, 4)).toBe(3.75)
  })

  it('handles min and max boundary scores', () => {
    expect(calcOverallScore(1, 1, 1, 1)).toBe(1)
    expect(calcOverallScore(5, 5, 5, 5)).toBe(5)
  })
})

// ─── Score validation (1–5) ───────────────────────────────────────────────────

describe('validateScores', () => {
  it('accepts valid scores in range 1–5', () => {
    expect(validateScores(1, 2, 3, 5).valid).toBe(true)
  })

  it('rejects score of 0', () => {
    const result = validateScores(0, 4, 4, 4)
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/deliveryScore/)
  })

  it('rejects score above 5', () => {
    const result = validateScores(4, 6, 4, 4)
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/qualityScore/)
  })

  it('rejects NaN', () => {
    expect(isValidScore(NaN)).toBe(false)
  })

  it('accepts float scores within range', () => {
    expect(isValidScore(3.5)).toBe(true)
    expect(isValidScore(4.9)).toBe(true)
  })
})

// ─── Vendor ranking by score ──────────────────────────────────────────────────

describe('rankVendorsBySore', () => {
  it('sorts vendors by avgOverall descending', () => {
    const cards: VendorScorecard[] = [
      makeScorecard({ vendorId: 'v1', avgOverall: 3.5 }),
      makeScorecard({ vendorId: 'v2', avgOverall: 4.8 }),
      makeScorecard({ vendorId: 'v3', avgOverall: 4.2 }),
    ]
    const ranked = rankVendorsBySore(cards)
    expect(ranked[0].vendorId).toBe('v2')
    expect(ranked[1].vendorId).toBe('v3')
    expect(ranked[2].vendorId).toBe('v1')
  })

  it('breaks ties by evaluationCount descending', () => {
    const cards: VendorScorecard[] = [
      makeScorecard({ vendorId: 'v1', avgOverall: 4.0, evaluationCount: 2 }),
      makeScorecard({ vendorId: 'v2', avgOverall: 4.0, evaluationCount: 10 }),
    ]
    const ranked = rankVendorsBySore(cards)
    expect(ranked[0].vendorId).toBe('v2')
  })

  it('does not mutate the original array', () => {
    const cards = [
      makeScorecard({ vendorId: 'v1', avgOverall: 3.0 }),
      makeScorecard({ vendorId: 'v2', avgOverall: 5.0 }),
    ]
    rankVendorsBySore(cards)
    expect(cards[0].vendorId).toBe('v1') // unchanged
  })
})

// ─── Score trend detection ────────────────────────────────────────────────────

describe('detectScoreTrend', () => {
  it('returns stable for fewer than 2 data points', () => {
    expect(detectScoreTrend([])).toBe('stable')
    expect(detectScoreTrend([{ evaluatedAt: '2024-01-01', overallScore: 4 }])).toBe('stable')
  })

  it('detects improving trend (delta > 0.2)', () => {
    const trends: ScoreTrend[] = [
      { evaluatedAt: '2024-01-01T00:00:00Z', overallScore: 3.0 },
      { evaluatedAt: '2024-02-01T00:00:00Z', overallScore: 3.5 },
      { evaluatedAt: '2024-03-01T00:00:00Z', overallScore: 4.2 },
    ]
    expect(detectScoreTrend(trends)).toBe('improving')
  })

  it('detects declining trend (delta < -0.2)', () => {
    const trends: ScoreTrend[] = [
      { evaluatedAt: '2024-01-01T00:00:00Z', overallScore: 4.5 },
      { evaluatedAt: '2024-02-01T00:00:00Z', overallScore: 3.8 },
      { evaluatedAt: '2024-03-01T00:00:00Z', overallScore: 3.0 },
    ]
    expect(detectScoreTrend(trends)).toBe('declining')
  })

  it('returns stable when delta is within ±0.2', () => {
    const trends: ScoreTrend[] = [
      { evaluatedAt: '2024-01-01T00:00:00Z', overallScore: 4.0 },
      { evaluatedAt: '2024-02-01T00:00:00Z', overallScore: 4.1 },
    ]
    expect(detectScoreTrend(trends)).toBe('stable')
  })

  it('sorts by date before comparing even if input is unordered', () => {
    const trends: ScoreTrend[] = [
      { evaluatedAt: '2024-03-01T00:00:00Z', overallScore: 4.5 }, // latest
      { evaluatedAt: '2024-01-01T00:00:00Z', overallScore: 3.0 }, // earliest
    ]
    expect(detectScoreTrend(trends)).toBe('improving')
  })
})

// ─── Preferred vendor selection ───────────────────────────────────────────────

describe('selectPreferredVendors', () => {
  it('selects vendors above threshold with enough evaluations', () => {
    const cards = [
      makeScorecard({ vendorId: 'v1', avgOverall: 4.5, evaluationCount: 5 }),
      makeScorecard({ vendorId: 'v2', avgOverall: 3.5, evaluationCount: 5 }),
      makeScorecard({ vendorId: 'v3', avgOverall: 4.2, evaluationCount: 1 }), // too few evals
    ]
    const preferred = selectPreferredVendors(cards)
    expect(preferred).toHaveLength(1)
    expect(preferred[0].vendorId).toBe('v1')
  })

  it('respects custom threshold and minEvaluations', () => {
    const cards = [
      makeScorecard({ vendorId: 'v1', avgOverall: 3.5, evaluationCount: 3 }),
      makeScorecard({ vendorId: 'v2', avgOverall: 3.8, evaluationCount: 1 }),
    ]
    const preferred = selectPreferredVendors(cards, 3.0, 1)
    expect(preferred).toHaveLength(2)
  })

  it('returns empty array when no vendor qualifies', () => {
    const cards = [makeScorecard({ avgOverall: 2.0, evaluationCount: 1 })]
    expect(selectPreferredVendors(cards)).toHaveLength(0)
  })
})

// ─── buildVendorScorecard ─────────────────────────────────────────────────────

describe('buildVendorScorecard', () => {
  it('returns zero scorecard for empty evaluations', () => {
    const sc = buildVendorScorecard('v1', 'Vendor A', [])
    expect(sc.avgOverall).toBe(0)
    expect(sc.evaluationCount).toBe(0)
    expect(sc.isPreferred).toBe(false)
  })

  it('calculates correct averages from multiple evaluations', () => {
    const evals = [
      makeEval({ deliveryScore: 4, qualityScore: 3, priceScore: 5, communicationScore: 4, overallScore: 4 }),
      makeEval({ deliveryScore: 2, qualityScore: 5, priceScore: 3, communicationScore: 4, overallScore: 3.5 }),
    ]
    const sc = buildVendorScorecard('v1', 'Vendor A', evals)
    expect(sc.avgDelivery).toBe(3)       // (4+2)/2
    expect(sc.avgQuality).toBe(4)        // (3+5)/2
    expect(sc.avgOverall).toBe(3.75)     // (4+3.5)/2
  })

  it('marks isPreferred true when threshold and minEvaluations are met', () => {
    const evals = [
      makeEval({ overallScore: 4.5 }),
      makeEval({ overallScore: 4.5 }),
    ]
    const sc = buildVendorScorecard('v1', 'Vendor A', evals)
    expect(sc.isPreferred).toBe(true)
  })
})
