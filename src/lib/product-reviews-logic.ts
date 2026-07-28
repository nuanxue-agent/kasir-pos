/**
 * @module product-reviews-logic
 * Pure business-logic functions for the product review & rating system.
 * No DB calls — all functions operate on plain data so they are fully testable.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type ReviewStatus = 'pending' | 'approved' | 'rejected'

export interface ProductReview {
  id: string
  storeId: string
  productId: string
  customerId: string
  orderId: string | null
  rating: number          // 1–5
  comment: string | null
  verified: boolean       // verified purchase
  status: ReviewStatus
  helpful: number         // helpful-count
  createdAt: string
}

export interface RatingSummary {
  productId: string
  totalReviews: number
  averageRating: number
  distribution: Record<1 | 2 | 3 | 4 | 5, number>
}

// ─── Rating helpers ───────────────────────────────────────────────────────────

/** Clamp a raw value to the 1–5 star range. */
export function clampRating(rating: number): number {
  return Math.min(5, Math.max(1, Math.round(rating)))
}

/** Calculate the average rating from an array of approved reviews.
 *  Returns 0 when there are no reviews. */
export function calcAverageRating(reviews: ProductReview[]): number {
  const approved = reviews.filter(r => r.status === 'approved')
  if (approved.length === 0) return 0
  const sum = approved.reduce((acc, r) => acc + r.rating, 0)
  return Math.round((sum / approved.length) * 10) / 10
}

/** Build a 1–5 distribution map from approved reviews. */
export function calcRatingDistribution(
  reviews: ProductReview[],
): Record<1 | 2 | 3 | 4 | 5, number> {
  const dist: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  for (const r of reviews) {
    if (r.status !== 'approved') continue
    const star = clampRating(r.rating) as 1 | 2 | 3 | 4 | 5
    dist[star]++
  }
  return dist
}

/** Build a full RatingSummary for a product from an array of reviews. */
export function buildRatingSummary(
  productId: string,
  reviews: ProductReview[],
): RatingSummary {
  const approved = reviews.filter(r => r.status === 'approved')
  return {
    productId,
    totalReviews: approved.length,
    averageRating: calcAverageRating(reviews),
    distribution: calcRatingDistribution(reviews),
  }
}

// ─── Verified purchase ────────────────────────────────────────────────────────

/** A review is considered a verified purchase when orderId is non-empty. */
export function isVerifiedPurchase(review: Pick<ProductReview, 'orderId'>): boolean {
  return Boolean(review.orderId && review.orderId.trim().length > 0)
}

// ─── Moderation ───────────────────────────────────────────────────────────────

type ModerationAction = 'approve' | 'reject'

/** Valid status transitions for moderation.
 *  Returns the new status, or throws if the transition is not allowed. */
export function applyModerationAction(
  current: ReviewStatus,
  action: ModerationAction,
): ReviewStatus {
  if (action === 'approve') {
    if (current === 'rejected') throw new Error('Cannot approve a rejected review')
    return 'approved'
  }
  // reject
  if (current === 'approved') throw new Error('Cannot reject an already-approved review')
  return 'rejected'
}

/** Returns true if a manager is allowed to moderate the review. */
export function canModerate(role: string): boolean {
  return role === 'manager' || role === 'owner' || role === 'admin'
}

// ─── Helpful count ────────────────────────────────────────────────────────────

/** Increment the helpful count by 1 (cannot go below 0). */
export function incrementHelpful(current: number): number {
  return Math.max(0, current) + 1
}

/** Decrement the helpful count (never below 0). */
export function decrementHelpful(current: number): number {
  return Math.max(0, current - 1)
}
