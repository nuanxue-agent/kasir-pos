import { describe, it, expect } from 'vitest'
import {
  classifyScore,
  calcNPS,
  calcResponseRate,
  calcSegmentBreakdown,
  calcTrend,
  calcAverageScore,
  filterByPeriod,
  type NPSResponse,
  type Segment,
} from '@/lib/nps-surveys'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mkResponse = (
  score: number,
  overrides: Partial<NPSResponse> = {},
): NPSResponse => ({
  id: `r-${score}`,
  surveyId: 's1',
  storeId: 'store1',
  customerId: null,
  score,
  comment: null,
  channel: 'IN_APP',
  respondedAt: '2026-01-15T10:00:00Z',
  ...overrides,
})

// responses: 3 promoters (9,10,9), 2 passives (7,8), 2 detractors (3,5)
const sampleResponses = [
  mkResponse(9),
  mkResponse(10),
  mkResponse(9),
  mkResponse(7),
  mkResponse(8),
  mkResponse(3),
  mkResponse(5),
]

// ─── Score classification ─────────────────────────────────────────────────────

describe('classifyScore', () => {
  it('scores 9-10 are PROMOTER', () => {
    expect(classifyScore(9)).toBe<Segment>('PROMOTER')
    expect(classifyScore(10)).toBe<Segment>('PROMOTER')
  })

  it('scores 7-8 are PASSIVE', () => {
    expect(classifyScore(7)).toBe<Segment>('PASSIVE')
    expect(classifyScore(8)).toBe<Segment>('PASSIVE')
  })

  it('scores 0-6 are DETRACTOR', () => {
    expect(classifyScore(0)).toBe<Segment>('DETRACTOR')
    expect(classifyScore(6)).toBe<Segment>('DETRACTOR')
    expect(classifyScore(3)).toBe<Segment>('DETRACTOR')
  })
})

// ─── NPS score calculation ────────────────────────────────────────────────────

describe('calcNPS', () => {
  it('returns zeros for empty responses', () => {
    const result = calcNPS([])
    expect(result.npsScore).toBe(0)
    expect(result.total).toBe(0)
    expect(result.promoters).toBe(0)
    expect(result.detractors).toBe(0)
  })

  it('calculates correct NPS score from mixed responses', () => {
    // promoters=3, detractors=2, total=7 → (3-2)/7*100 ≈ 14.3
    const result = calcNPS(sampleResponses)
    expect(result.promoters).toBe(3)
    expect(result.passives).toBe(2)
    expect(result.detractors).toBe(2)
    expect(result.total).toBe(7)
    expect(result.npsScore).toBeCloseTo(14.3, 0)
  })

  it('returns +100 when all responses are promoters', () => {
    const all = [mkResponse(9), mkResponse(10), mkResponse(9)]
    expect(calcNPS(all).npsScore).toBe(100)
  })

  it('returns -100 when all responses are detractors', () => {
    const all = [mkResponse(0), mkResponse(3), mkResponse(6)]
    expect(calcNPS(all).npsScore).toBe(-100)
  })
})

// ─── Response rate ────────────────────────────────────────────────────────────

describe('calcResponseRate', () => {
  it('returns 0 when sentCount is zero', () => {
    expect(calcResponseRate(5, 0)).toBe(0)
  })

  it('calculates percentage correctly', () => {
    expect(calcResponseRate(25, 100)).toBe(25)
  })

  it('rounds to 1 decimal place', () => {
    expect(calcResponseRate(1, 3)).toBe(33.3)
  })
})

// ─── Segment breakdown ────────────────────────────────────────────────────────

describe('calcSegmentBreakdown', () => {
  it('returns correct percentages for sample responses', () => {
    const bd = calcSegmentBreakdown(sampleResponses)
    const promoter  = bd.find(x => x.segment === 'PROMOTER')!
    const passive   = bd.find(x => x.segment === 'PASSIVE')!
    const detractor = bd.find(x => x.segment === 'DETRACTOR')!

    expect(promoter.count).toBe(3)
    expect(promoter.pct).toBeCloseTo(42.9, 0)
    expect(passive.count).toBe(2)
    expect(detractor.count).toBe(2)
  })

  it('returns zero percentages for empty input', () => {
    const bd = calcSegmentBreakdown([])
    expect(bd.every(x => x.pct === 0)).toBe(true)
  })
})

// ─── Trend period comparison ──────────────────────────────────────────────────

describe('calcTrend', () => {
  it('reports UP trend when current NPS is higher than previous', () => {
    const cur  = [mkResponse(10), mkResponse(9), mkResponse(9)]  // NPS=100
    const prev = [mkResponse(6),  mkResponse(3), mkResponse(0)]  // NPS=-100
    const result = calcTrend(cur, prev)
    expect(result.trend).toBe('UP')
    expect(result.delta).toBe(200)
  })

  it('reports DOWN trend when current NPS is lower than previous', () => {
    const cur  = [mkResponse(0), mkResponse(2)]   // NPS=-100
    const prev = [mkResponse(9), mkResponse(10)]  // NPS=100
    const result = calcTrend(cur, prev)
    expect(result.trend).toBe('DOWN')
    expect(result.delta).toBe(-200)
  })

  it('reports FLAT trend when NPS is unchanged', () => {
    const cur  = [mkResponse(9), mkResponse(0)] // NPS=0
    const prev = [mkResponse(9), mkResponse(0)] // NPS=0
    const result = calcTrend(cur, prev)
    expect(result.trend).toBe('FLAT')
    expect(result.delta).toBe(0)
  })
})

// ─── Average score ────────────────────────────────────────────────────────────

describe('calcAverageScore', () => {
  it('returns 0 for empty responses', () => {
    expect(calcAverageScore([])).toBe(0)
  })

  it('calculates correct average', () => {
    // (9+10+9+7+8+3+5)/7 = 51/7 ≈ 7.3
    expect(calcAverageScore(sampleResponses)).toBeCloseTo(7.3, 0)
  })
})
