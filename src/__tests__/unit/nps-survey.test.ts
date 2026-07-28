import { describe, it, expect } from 'vitest'

// ── Types ─────────────────────────────────────────────────────────────────────

interface NpsResponse {
  id: string
  surveyId: string
  score: number
  createdAt: string
}

// ── Business Logic ─────────────────────────────────────────────────────────────

/** Classify a score into a segment */
function classifyScore(score: number): 'promoter' | 'passive' | 'detractor' {
  if (score >= 9) return 'promoter'
  if (score >= 7) return 'passive'
  return 'detractor'
}

/** Validate score is integer 0–10 */
function isValidScore(score: unknown): boolean {
  return (
    typeof score === 'number' &&
    Number.isInteger(score) &&
    score >= 0 &&
    score <= 10
  )
}

/** Calculate NPS score from a list of responses */
function calcNps(responses: NpsResponse[]): number | null {
  if (responses.length === 0) return null
  const promoters = responses.filter(r => r.score >= 9).length
  const detractors = responses.filter(r => r.score <= 6).length
  return Math.round(((promoters - detractors) / responses.length) * 100)
}

/** Calculate segment breakdown with percentages */
function calcBreakdown(responses: NpsResponse[]) {
  const total = responses.length
  const promoters = responses.filter(r => r.score >= 9).length
  const passives = responses.filter(r => r.score >= 7 && r.score <= 8).length
  const detractors = responses.filter(r => r.score <= 6).length
  return {
    total,
    promoters,
    passives,
    detractors,
    promoterPct: total > 0 ? Math.round((promoters / total) * 100) : 0,
    passivePct: total > 0 ? Math.round((passives / total) * 100) : 0,
    detractorPct: total > 0 ? Math.round((detractors / total) * 100) : 0,
  }
}

/** Get ISO week Monday for a given ISO date string */
function getWeekKey(iso: string): string {
  const d = new Date(iso)
  const day = d.getUTCDay()
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff))
  return monday.toISOString().slice(0, 10)
}

/** Aggregate responses into weekly NPS buckets */
function aggregateWeeklyTrend(
  responses: NpsResponse[],
  weeks: string[],
): { week: string; nps: number | null; count: number }[] {
  return weeks.map(weekKey => {
    const weekStart = new Date(weekKey)
    const weekEnd = new Date(weekStart.getTime() + 7 * 86400000)
    const bucket = responses.filter(r => {
      const d = new Date(r.createdAt)
      return d >= weekStart && d < weekEnd
    })
    return {
      week: weekKey,
      nps: calcNps(bucket),
      count: bucket.length,
    }
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeResponse(id: string, score: number, createdAt = '2025-06-01T00:00:00.000Z'): NpsResponse {
  return { id, surveyId: 'survey-1', score, createdAt }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('NPS Score Calculation', () => {
  it('returns null for empty responses', () => {
    expect(calcNps([])).toBeNull()
  })

  it('calculates NPS with all promoters', () => {
    const responses = [
      makeResponse('1', 9),
      makeResponse('2', 10),
      makeResponse('3', 9),
    ]
    // 3 promoters, 0 detractors → 100
    expect(calcNps(responses)).toBe(100)
  })

  it('calculates NPS with all detractors', () => {
    const responses = [
      makeResponse('1', 0),
      makeResponse('2', 3),
      makeResponse('3', 6),
    ]
    // 0 promoters, 3 detractors → -100
    expect(calcNps(responses)).toBe(-100)
  })

  it('calculates NPS with mixed responses', () => {
    // 2 promoters (9,10), 1 passive (7), 1 detractor (3) → total 4
    // (2-1)/4 * 100 = 25
    const responses = [
      makeResponse('1', 10),
      makeResponse('2', 9),
      makeResponse('3', 7),
      makeResponse('4', 3),
    ]
    expect(calcNps(responses)).toBe(25)
  })
})

describe('Promoter/Passive/Detractor Classification', () => {
  it('classifies 9 and 10 as promoter', () => {
    expect(classifyScore(9)).toBe('promoter')
    expect(classifyScore(10)).toBe('promoter')
  })

  it('classifies 7 and 8 as passive', () => {
    expect(classifyScore(7)).toBe('passive')
    expect(classifyScore(8)).toBe('passive')
  })

  it('classifies 0–6 as detractor', () => {
    expect(classifyScore(0)).toBe('detractor')
    expect(classifyScore(6)).toBe('detractor')
    expect(classifyScore(3)).toBe('detractor')
  })
})

describe('Response Validation', () => {
  it('accepts valid scores 0–10', () => {
    for (let i = 0; i <= 10; i++) {
      expect(isValidScore(i)).toBe(true)
    }
  })

  it('rejects scores outside 0–10', () => {
    expect(isValidScore(-1)).toBe(false)
    expect(isValidScore(11)).toBe(false)
  })

  it('rejects non-integer scores', () => {
    expect(isValidScore(7.5)).toBe(false)
    expect(isValidScore('8')).toBe(false)
    expect(isValidScore(null)).toBe(false)
  })
})

describe('Segment Percentage Calculation', () => {
  it('returns all-zero breakdown for empty responses', () => {
    const b = calcBreakdown([])
    expect(b.promoterPct).toBe(0)
    expect(b.passivePct).toBe(0)
    expect(b.detractorPct).toBe(0)
  })

  it('calculates correct segment percentages', () => {
    // 2 promoters, 1 passive, 1 detractor out of 4
    const responses = [
      makeResponse('1', 10),
      makeResponse('2', 9),
      makeResponse('3', 8),
      makeResponse('4', 5),
    ]
    const b = calcBreakdown(responses)
    expect(b.promoters).toBe(2)
    expect(b.passives).toBe(1)
    expect(b.detractors).toBe(1)
    expect(b.promoterPct).toBe(50)
    expect(b.passivePct).toBe(25)
    expect(b.detractorPct).toBe(25)
  })
})

describe('Weekly Trend Aggregation', () => {
  it('returns null NPS for weeks with no responses', () => {
    const weeks = ['2025-06-02', '2025-06-09']
    const trend = aggregateWeeklyTrend([], weeks)
    expect(trend[0].nps).toBeNull()
    expect(trend[0].count).toBe(0)
  })

  it('aggregates responses into correct weeks', () => {
    const responses = [
      makeResponse('1', 10, '2025-06-02T10:00:00.000Z'), // week of 2025-06-02
      makeResponse('2', 9, '2025-06-03T10:00:00.000Z'),  // same week
      makeResponse('3', 2, '2025-06-10T10:00:00.000Z'),  // week of 2025-06-09
    ]
    const weeks = ['2025-06-02', '2025-06-09']
    const trend = aggregateWeeklyTrend(responses, weeks)
    expect(trend[0].count).toBe(2)
    expect(trend[0].nps).toBe(100) // 2 promoters, 0 detractors
    expect(trend[1].count).toBe(1)
    expect(trend[1].nps).toBe(-100) // 1 detractor
  })

  it('getWeekKey returns the Monday of the week', () => {
    // 2025-06-04 is a Wednesday — Monday should be 2025-06-02
    expect(getWeekKey('2025-06-04T00:00:00.000Z')).toBe('2025-06-02')
    // 2025-06-09 is a Monday
    expect(getWeekKey('2025-06-09T00:00:00.000Z')).toBe('2025-06-09')
  })
})
