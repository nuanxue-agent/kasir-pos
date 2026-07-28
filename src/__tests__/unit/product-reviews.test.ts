import { describe, it, expect } from 'vitest'
import {
  calcAverageRating,
  calcRatingDistribution,
  buildRatingSummary,
  isVerifiedPurchase,
  applyModerationAction,
  canModerate,
  incrementHelpful,
  decrementHelpful,
  clampRating,
  type ProductReview,
  type ReviewStatus,
} from '@/lib/product-reviews-logic'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReview(overrides: Partial<ProductReview> = {}): ProductReview {
  return {
    id:         'rev-1',
    storeId:    'store-1',
    productId:  'prod-1',
    customerId: 'cust-1',
    orderId:    'order-1',
    rating:     5,
    comment:    'Great product!',
    verified:   true,
    status:     'approved',
    helpful:    0,
    createdAt:  '2024-06-01T10:00:00.000Z',
    ...overrides,
  }
}

function makeReviews(ratings: number[], status: ReviewStatus = 'approved'): ProductReview[] {
  return ratings.map((r, i) => makeReview({ id: `rev-${i + 1}`, rating: r, status }))
}

// ─── 1. Average rating calculation ───────────────────────────────────────────

describe('calcAverageRating', () => {
  it('returns 0 when there are no reviews', () => {
    expect(calcAverageRating([])).toBe(0)
  })

  it('calculates average correctly for a single review', () => {
    expect(calcAverageRating(makeReviews([4]))).toBe(4)
  })

  it('calculates average correctly for multiple reviews', () => {
    // (5 + 3 + 4) / 3 = 4.0
    expect(calcAverageRating(makeReviews([5, 3, 4]))).toBe(4)
  })

  it('rounds to one decimal place', () => {
    // (5 + 4 + 3) / 3 = 4.0 → but (5 + 4 + 2) / 3 = 3.666… → 3.7
    expect(calcAverageRating(makeReviews([5, 4, 2]))).toBe(3.7)
  })

  it('ignores non-approved reviews in the average', () => {
    const reviews = [
      makeReview({ id: 'r1', rating: 5, status: 'approved' }),
      makeReview({ id: 'r2', rating: 1, status: 'pending' }),
      makeReview({ id: 'r3', rating: 1, status: 'rejected' }),
    ]
    expect(calcAverageRating(reviews)).toBe(5)
  })
})

// ─── 2. Rating distribution ───────────────────────────────────────────────────

describe('calcRatingDistribution', () => {
  it('returns zeroes for all stars when no reviews', () => {
    const dist = calcRatingDistribution([])
    expect(dist).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 })
  })

  it('counts each star correctly', () => {
    const reviews = makeReviews([5, 5, 4, 3, 1])
    const dist = calcRatingDistribution(reviews)
    expect(dist[5]).toBe(2)
    expect(dist[4]).toBe(1)
    expect(dist[3]).toBe(1)
    expect(dist[2]).toBe(0)
    expect(dist[1]).toBe(1)
  })

  it('excludes pending and rejected reviews from distribution', () => {
    const reviews = [
      makeReview({ id: 'r1', rating: 5, status: 'approved' }),
      makeReview({ id: 'r2', rating: 2, status: 'pending' }),
      makeReview({ id: 'r3', rating: 1, status: 'rejected' }),
    ]
    const dist = calcRatingDistribution(reviews)
    expect(dist[5]).toBe(1)
    expect(dist[2]).toBe(0)
    expect(dist[1]).toBe(0)
  })
})

// ─── 3. Verified purchase check ───────────────────────────────────────────────

describe('isVerifiedPurchase', () => {
  it('returns true when orderId is a non-empty string', () => {
    expect(isVerifiedPurchase({ orderId: 'order-123' })).toBe(true)
  })

  it('returns false when orderId is null', () => {
    expect(isVerifiedPurchase({ orderId: null })).toBe(false)
  })

  it('returns false when orderId is an empty string', () => {
    expect(isVerifiedPurchase({ orderId: '' })).toBe(false)
  })

  it('returns false when orderId is whitespace only', () => {
    expect(isVerifiedPurchase({ orderId: '   ' })).toBe(false)
  })
})

// ─── 4. Moderation status transitions ────────────────────────────────────────

describe('applyModerationAction', () => {
  it('transitions pending → approved on approve', () => {
    expect(applyModerationAction('pending', 'approve')).toBe('approved')
  })

  it('transitions pending → rejected on reject', () => {
    expect(applyModerationAction('pending', 'reject')).toBe('rejected')
  })

  it('allows already-pending to be approved again (idempotent)', () => {
    expect(applyModerationAction('approved', 'approve')).toBe('approved')
  })

  it('throws when trying to approve a rejected review', () => {
    expect(() => applyModerationAction('rejected', 'approve')).toThrow()
  })

  it('throws when trying to reject an already-approved review', () => {
    expect(() => applyModerationAction('approved', 'reject')).toThrow()
  })

  it('canModerate returns true for manager role', () => {
    expect(canModerate('manager')).toBe(true)
  })

  it('canModerate returns false for cashier role', () => {
    expect(canModerate('cashier')).toBe(false)
  })
})

// ─── 5. Helpful count increment ───────────────────────────────────────────────

describe('incrementHelpful / decrementHelpful', () => {
  it('increments helpful count by 1', () => {
    expect(incrementHelpful(0)).toBe(1)
    expect(incrementHelpful(5)).toBe(6)
  })

  it('never returns a negative helpful count on decrement', () => {
    expect(decrementHelpful(0)).toBe(0)
    expect(decrementHelpful(-3)).toBe(0)
  })

  it('decrements helpful count correctly when > 0', () => {
    expect(decrementHelpful(3)).toBe(2)
  })
})

// ─── 6. buildRatingSummary ────────────────────────────────────────────────────

describe('buildRatingSummary', () => {
  it('builds a correct summary for a product with mixed reviews', () => {
    const reviews = [
      makeReview({ id: 'r1', rating: 5, status: 'approved' }),
      makeReview({ id: 'r2', rating: 4, status: 'approved' }),
      makeReview({ id: 'r3', rating: 3, status: 'pending' }),
    ]
    const summary = buildRatingSummary('prod-1', reviews)
    expect(summary.productId).toBe('prod-1')
    expect(summary.totalReviews).toBe(2)    // only approved
    expect(summary.averageRating).toBe(4.5) // (5+4)/2
    expect(summary.distribution[5]).toBe(1)
    expect(summary.distribution[4]).toBe(1)
    expect(summary.distribution[3]).toBe(0) // pending not counted
  })

  it('clampRating keeps values within 1–5', () => {
    expect(clampRating(0)).toBe(1)
    expect(clampRating(6)).toBe(5)
    expect(clampRating(3)).toBe(3)
  })
})
