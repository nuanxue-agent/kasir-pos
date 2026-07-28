import { describe, it, expect } from 'vitest'

// ── Performance Review — pure business logic ───────────────────────────────────

type ScoreDimension = 'attendance' | 'sales' | 'teamwork' | 'punctuality'
type ReviewStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED'
type CyclePeriod = 'QUARTERLY' | 'ANNUAL'

interface Scores {
  attendance: number
  sales: number
  teamwork: number
  punctuality: number
}

interface ReviewCycle {
  id: string
  storeId: string
  name: string
  period: CyclePeriod
  year: number
  startDate: string
  endDate: string
  status: 'DRAFT' | 'ACTIVE' | 'CLOSED'
}

interface PerformanceReview {
  id: string
  cycleId: string
  employeeId: string
  reviewerId?: string
  scores: Scores
  overallScore: number
  comments?: string
  selfAssessment?: string
  status: ReviewStatus
}

// ── Business logic functions ──────────────────────────────────────────────────

function calcOverallScore(scores: Scores): number {
  const dims: ScoreDimension[] = ['attendance', 'sales', 'teamwork', 'punctuality']
  const total = dims.reduce((sum, d) => sum + (scores[d] ?? 0), 0)
  return Math.round((total / dims.length) * 10) / 10
}

function validateScores(scores: Scores): boolean {
  const dims: ScoreDimension[] = ['attendance', 'sales', 'teamwork', 'punctuality']
  return dims.every(d => {
    const v = scores[d]
    return Number.isInteger(v) && v >= 1 && v <= 5
  })
}

function canApprove(review: PerformanceReview, userRole: string): boolean {
  return (userRole === 'OWNER' || userRole === 'MANAGER') && review.status === 'SUBMITTED'
}

function canSubmit(review: PerformanceReview): boolean {
  return review.status === 'DRAFT'
}

function getPerformanceLabel(score: number): string {
  if (score >= 4.5) return 'Luar Biasa'
  if (score >= 3.5) return 'Melampaui Ekspektasi'
  if (score >= 2.5) return 'Memenuhi Ekspektasi'
  if (score >= 1.5) return 'Di Bawah Ekspektasi'
  return 'Perlu Perbaikan'
}

function getCycleQuarter(cycle: ReviewCycle): number | null {
  if (cycle.period !== 'QUARTERLY') return null
  const month = new Date(cycle.startDate).getMonth() + 1
  return Math.ceil(month / 3)
}

function filterReviewsByStatus(
  reviews: PerformanceReview[],
  status: ReviewStatus,
): PerformanceReview[] {
  return reviews.filter(r => r.status === status)
}

function averageScoreByDimension(reviews: PerformanceReview[]): Partial<Record<ScoreDimension, number>> {
  if (reviews.length === 0) return {}
  const dims: ScoreDimension[] = ['attendance', 'sales', 'teamwork', 'punctuality']
  const result: Partial<Record<ScoreDimension, number>> = {}
  for (const d of dims) {
    const avg = reviews.reduce((sum, r) => sum + (r.scores[d] ?? 0), 0) / reviews.length
    result[d] = Math.round(avg * 10) / 10
  }
  return result
}

function normalizeCyclePeriod(input: string): CyclePeriod {
  const upper = input.toUpperCase()
  if (upper === 'QUARTERLY' || upper === 'Q') return 'QUARTERLY'
  if (upper === 'ANNUAL' || upper === 'YEARLY' || upper === 'Y') return 'ANNUAL'
  throw new Error(`Unknown period: ${input}`)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Performance Review — calcOverallScore', () => {
  it('calculates average of four dimensions', () => {
    expect(calcOverallScore({ attendance: 4, sales: 3, teamwork: 5, punctuality: 4 })).toBe(4)
  })

  it('rounds to 1 decimal place', () => {
    expect(calcOverallScore({ attendance: 3, sales: 4, teamwork: 3, punctuality: 4 })).toBe(3.5)
  })

  it('handles all-1 scores', () => {
    expect(calcOverallScore({ attendance: 1, sales: 1, teamwork: 1, punctuality: 1 })).toBe(1)
  })

  it('handles all-5 scores', () => {
    expect(calcOverallScore({ attendance: 5, sales: 5, teamwork: 5, punctuality: 5 })).toBe(5)
  })
})

describe('Performance Review — validateScores', () => {
  it('accepts valid 1-5 integer scores', () => {
    expect(validateScores({ attendance: 3, sales: 2, teamwork: 5, punctuality: 1 })).toBe(true)
  })

  it('rejects score of 0', () => {
    expect(validateScores({ attendance: 0, sales: 3, teamwork: 3, punctuality: 3 })).toBe(false)
  })

  it('rejects score of 6', () => {
    expect(validateScores({ attendance: 6, sales: 3, teamwork: 3, punctuality: 3 })).toBe(false)
  })

  it('rejects non-integer score', () => {
    expect(validateScores({ attendance: 3.5, sales: 3, teamwork: 3, punctuality: 3 })).toBe(false)
  })
})

describe('Performance Review — status transitions', () => {
  const draft: PerformanceReview = {
    id: '1', cycleId: 'c1', employeeId: 'e1',
    scores: { attendance: 4, sales: 4, teamwork: 4, punctuality: 4 },
    overallScore: 4, status: 'DRAFT',
  }

  it('allows DRAFT to be submitted', () => {
    expect(canSubmit(draft)).toBe(true)
  })

  it('does not allow SUBMITTED to be submitted again', () => {
    expect(canSubmit({ ...draft, status: 'SUBMITTED' })).toBe(false)
  })

  it('allows OWNER to approve SUBMITTED review', () => {
    expect(canApprove({ ...draft, status: 'SUBMITTED' }, 'OWNER')).toBe(true)
  })

  it('does not allow STAFF to approve', () => {
    expect(canApprove({ ...draft, status: 'SUBMITTED' }, 'STAFF')).toBe(false)
  })
})

describe('Performance Review — helpers', () => {
  it('labels score 4.8 as Luar Biasa', () => {
    expect(getPerformanceLabel(4.8)).toBe('Luar Biasa')
  })

  it('labels score 2.0 as Di Bawah Ekspektasi', () => {
    expect(getPerformanceLabel(2.0)).toBe('Di Bawah Ekspektasi')
  })

  it('gets quarter 1 for Q1 cycle', () => {
    const cycle: ReviewCycle = {
      id: 'c1', storeId: 's1', name: 'Q1', period: 'QUARTERLY', year: 2025,
      startDate: '2025-01-01', endDate: '2025-03-31', status: 'ACTIVE',
    }
    expect(getCycleQuarter(cycle)).toBe(1)
  })

  it('returns null quarter for ANNUAL cycle', () => {
    const cycle: ReviewCycle = {
      id: 'c1', storeId: 's1', name: 'Annual', period: 'ANNUAL', year: 2025,
      startDate: '2025-01-01', endDate: '2025-12-31', status: 'ACTIVE',
    }
    expect(getCycleQuarter(cycle)).toBeNull()
  })

  it('filters reviews by status', () => {
    const reviews: PerformanceReview[] = [
      { id: '1', cycleId: 'c1', employeeId: 'e1', scores: { attendance: 3, sales: 3, teamwork: 3, punctuality: 3 }, overallScore: 3, status: 'DRAFT' },
      { id: '2', cycleId: 'c1', employeeId: 'e2', scores: { attendance: 4, sales: 4, teamwork: 4, punctuality: 4 }, overallScore: 4, status: 'APPROVED' },
    ]
    expect(filterReviewsByStatus(reviews, 'DRAFT')).toHaveLength(1)
  })

  it('averages scores by dimension', () => {
    const reviews: PerformanceReview[] = [
      { id: '1', cycleId: 'c1', employeeId: 'e1', scores: { attendance: 4, sales: 2, teamwork: 3, punctuality: 5 }, overallScore: 3.5, status: 'APPROVED' },
      { id: '2', cycleId: 'c1', employeeId: 'e2', scores: { attendance: 2, sales: 4, teamwork: 3, punctuality: 3 }, overallScore: 3, status: 'APPROVED' },
    ]
    const avg = averageScoreByDimension(reviews)
    expect(avg.attendance).toBe(3)
    expect(avg.sales).toBe(3)
  })

  it('normalizes QUARTERLY period aliases', () => {
    expect(normalizeCyclePeriod('Q')).toBe('QUARTERLY')
    expect(normalizeCyclePeriod('quarterly')).toBe('QUARTERLY')
  })

  it('normalizes ANNUAL period aliases', () => {
    expect(normalizeCyclePeriod('YEARLY')).toBe('ANNUAL')
    expect(normalizeCyclePeriod('y')).toBe('ANNUAL')
  })
})
