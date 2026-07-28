import { describe, it, expect } from 'vitest'
import {
  aggregateScores,
  calcDimensionAverage,
  calcCompletionRate,
  isValidCycleTransition,
  type PeerReview,
} from '@/lib/performance-review'

type ReviewOverrides = Partial<PeerReview> & { reviewerId: string; revieweeId: string }

function makeReview(overrides: ReviewOverrides): PeerReview {
  const now = new Date().toISOString()
  return {
    id: overrides.id ?? 'r-1',
    cycleId: overrides.cycleId ?? 'cycle-1',
    storeId: overrides.storeId ?? 'store-1',
    reviewerId: overrides.reviewerId,
    revieweeId: overrides.revieweeId,
    scores: overrides.scores ?? { communication: 3, teamwork: 3, skills: 3, attitude: 3 },
    comments: overrides.comments ?? null,
    submittedAt: overrides.submittedAt !== undefined ? overrides.submittedAt : now,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  }
}

describe('aggregateScores', () => {
  it('averages scores from multiple reviewers', () => {
    const reviews: PeerReview[] = [
      makeReview({ id: 'r1', reviewerId: 'emp-1', revieweeId: 'emp-2', scores: { communication: 4, teamwork: 4, skills: 4, attitude: 4 } }),
      makeReview({ id: 'r2', reviewerId: 'emp-3', revieweeId: 'emp-2', scores: { communication: 2, teamwork: 2, skills: 2, attitude: 2 } }),
    ]
    const [result] = aggregateScores(reviews)
    expect(result.revieweeId).toBe('emp-2')
    expect(result.communication).toBe(3)
    expect(result.overall).toBe(3)
  })

  it('excludes reviews without submittedAt', () => {
    const reviews: PeerReview[] = [
      makeReview({ id: 'r1', reviewerId: 'emp-1', revieweeId: 'emp-2', scores: { communication: 5, teamwork: 5, skills: 5, attitude: 5 } }),
      makeReview({ id: 'r2', reviewerId: 'emp-3', revieweeId: 'emp-2', submittedAt: null }),
    ]
    const [result] = aggregateScores(reviews)
    expect(result.reviewerCount).toBe(1)
    expect(result.communication).toBe(5)
  })

  it('returns empty array when no reviews', () => {
    expect(aggregateScores([])).toHaveLength(0)
  })

  it('aggregates separately for each reviewee', () => {
    const reviews: PeerReview[] = [
      makeReview({ id: 'r1', reviewerId: 'emp-1', revieweeId: 'emp-2', scores: { communication: 4, teamwork: 4, skills: 4, attitude: 4 } }),
      makeReview({ id: 'r2', reviewerId: 'emp-1', revieweeId: 'emp-3', scores: { communication: 2, teamwork: 2, skills: 2, attitude: 2 } }),
    ]
    const results = aggregateScores(reviews)
    expect(results).toHaveLength(2)
    const emp2 = results.find(r => r.revieweeId === 'emp-2')!
    const emp3 = results.find(r => r.revieweeId === 'emp-3')!
    expect(emp2.overall).toBe(4)
    expect(emp3.overall).toBe(2)
  })
})

describe('aggregateScores self-assessment weight', () => {
  it('applies 0.5x weight to self-assessment by default', () => {
    const reviews: PeerReview[] = [
      makeReview({ id: 'r1', reviewerId: 'emp-1', revieweeId: 'emp-2', scores: { communication: 4, teamwork: 4, skills: 4, attitude: 4 } }),
      makeReview({ id: 'r2', reviewerId: 'emp-2', revieweeId: 'emp-2', scores: { communication: 2, teamwork: 2, skills: 2, attitude: 2 } }),
    ]
    const [result] = aggregateScores(reviews)
    expect(result.communication).toBeCloseTo(3.33, 1)
  })

  it('applies custom selfWeight of 1 equal weight', () => {
    const reviews: PeerReview[] = [
      makeReview({ id: 'r1', reviewerId: 'emp-1', revieweeId: 'emp-2', scores: { communication: 4, teamwork: 4, skills: 4, attitude: 4 } }),
      makeReview({ id: 'r2', reviewerId: 'emp-2', revieweeId: 'emp-2', scores: { communication: 2, teamwork: 2, skills: 2, attitude: 2 } }),
    ]
    const [result] = aggregateScores(reviews, 1)
    expect(result.communication).toBe(3)
  })
})

describe('calcDimensionAverage', () => {
  it('returns correct average', () => {
    expect(calcDimensionAverage([4, 2, 3])).toBeCloseTo(3, 2)
  })

  it('returns 0 for empty array', () => {
    expect(calcDimensionAverage([])).toBe(0)
  })

  it('handles single value', () => {
    expect(calcDimensionAverage([5])).toBe(5)
  })
})

describe('isValidCycleTransition', () => {
  it('allows DRAFT to ACTIVE', () => {
    expect(isValidCycleTransition('DRAFT', 'ACTIVE')).toBe(true)
  })

  it('allows ACTIVE to CLOSED', () => {
    expect(isValidCycleTransition('ACTIVE', 'CLOSED')).toBe(true)
  })

  it('allows CLOSED to DRAFT re-open', () => {
    expect(isValidCycleTransition('CLOSED', 'DRAFT')).toBe(true)
  })

  it('rejects DRAFT to CLOSED skips ACTIVE', () => {
    expect(isValidCycleTransition('DRAFT', 'CLOSED')).toBe(false)
  })

  it('rejects ACTIVE to DRAFT backwards', () => {
    expect(isValidCycleTransition('ACTIVE', 'DRAFT')).toBe(false)
  })
})

describe('calcCompletionRate', () => {
  it('returns 1 when all reviews submitted', () => {
    const reviews: PeerReview[] = [
      makeReview({ id: 'r1', reviewerId: 'emp-1', revieweeId: 'emp-2' }),
      makeReview({ id: 'r2', reviewerId: 'emp-3', revieweeId: 'emp-2' }),
    ]
    expect(calcCompletionRate(reviews)).toBe(1)
  })

  it('returns 0.5 when half submitted', () => {
    const now = new Date().toISOString()
    const reviews: PeerReview[] = [
      makeReview({ id: 'r1', reviewerId: 'emp-1', revieweeId: 'emp-2', submittedAt: now }),
      makeReview({ id: 'r2', reviewerId: 'emp-3', revieweeId: 'emp-2', submittedAt: null }),
    ]
    expect(calcCompletionRate(reviews)).toBe(0.5)
  })

  it('returns 0 for empty array', () => {
    expect(calcCompletionRate([])).toBe(0)
  })
})
