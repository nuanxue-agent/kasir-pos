// ─── Performance Review — pure business logic (no I/O) ────────────────────────
// Importable by tests without any DB or Next.js dependencies.

export type ReviewCycleStatus = 'DRAFT' | 'ACTIVE' | 'CLOSED'
export type ReviewCycleType = 'ANNUAL' | 'QUARTERLY' | 'PEER'

export interface ReviewCycle {
  id: string
  storeId: string
  name: string
  startDate: string
  endDate: string
  status: ReviewCycleStatus
  type: ReviewCycleType
  createdAt: string
  updatedAt: string
}

export interface PeerReviewScores {
  communication: number
  teamwork: number
  skills: number
  attitude: number
}

export interface PeerReview {
  id: string
  cycleId: string
  reviewerId: string
  revieweeId: string
  storeId: string
  scores: PeerReviewScores
  comments: string | null
  submittedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface AggregatedScores {
  revieweeId: string
  communication: number
  teamwork: number
  skills: number
  attitude: number
  overall: number
  reviewerCount: number
}

export const PEER_DIMENSIONS: Array<keyof PeerReviewScores> = [
  'communication',
  'teamwork',
  'skills',
  'attitude',
]

// ─── Status machine ────────────────────────────────────────────────────────────

/**
 * Allowed cycle status transitions:
 *   DRAFT  → ACTIVE   (manager activates)
 *   ACTIVE → CLOSED   (manager closes after period)
 *   CLOSED → DRAFT    (re-open as draft for revision — rare but allowed)
 */
const ALLOWED_CYCLE_TRANSITIONS: Record<ReviewCycleStatus, ReviewCycleStatus[]> = {
  DRAFT: ['ACTIVE'],
  ACTIVE: ['CLOSED'],
  CLOSED: ['DRAFT'],
}

export function isValidCycleTransition(
  from: ReviewCycleStatus,
  to: ReviewCycleStatus,
): boolean {
  return ALLOWED_CYCLE_TRANSITIONS[from]?.includes(to) ?? false
}

// ─── Score aggregation ────────────────────────────────────────────────────────

/**
 * Aggregate peer review scores per reviewee across all submitted reviews.
 * Only reviews with a non-null submittedAt are included (i.e. submitted).
 * Self-assessments (reviewerId === revieweeId) are weighted at 0.5x by default.
 */
export function aggregateScores(
  reviews: PeerReview[],
  selfWeight = 0.5,
): AggregatedScores[] {
  const submitted = reviews.filter(r => r.submittedAt !== null)

  const byReviewee: Record<string, { weighted: PeerReviewScores; totalWeight: number }> = {}

  for (const r of submitted) {
    const isSelf = r.reviewerId === r.revieweeId
    const weight = isSelf ? selfWeight : 1

    if (!byReviewee[r.revieweeId]) {
      byReviewee[r.revieweeId] = {
        weighted: { communication: 0, teamwork: 0, skills: 0, attitude: 0 },
        totalWeight: 0,
      }
    }

    const entry = byReviewee[r.revieweeId]
    for (const dim of PEER_DIMENSIONS) {
      entry.weighted[dim] += r.scores[dim] * weight
    }
    entry.totalWeight += weight
  }

  return Object.entries(byReviewee).map(([revieweeId, { weighted, totalWeight }]) => {
    const avg = (dim: keyof PeerReviewScores) =>
      totalWeight > 0 ? round2(weighted[dim] / totalWeight) : 0

    const communication = avg('communication')
    const teamwork = avg('teamwork')
    const skills = avg('skills')
    const attitude = avg('attitude')
    const overall = round2((communication + teamwork + skills + attitude) / 4)

    // Count unique non-self reviewers
    const reviewerCount = submitted.filter(
      r => r.revieweeId === revieweeId && r.reviewerId !== revieweeId,
    ).length

    return { revieweeId, communication, teamwork, skills, attitude, overall, reviewerCount }
  })
}

/**
 * Calculate the average for a single dimension across a set of scores.
 */
export function calcDimensionAverage(
  scores: number[],
): number {
  if (scores.length === 0) return 0
  return round2(scores.reduce((a, b) => a + b, 0) / scores.length)
}

/**
 * Calculate peer review completion rate: submitted / total invited.
 * Returns a value between 0 and 1.
 */
export function calcCompletionRate(reviews: PeerReview[]): number {
  if (reviews.length === 0) return 0
  const submitted = reviews.filter(r => r.submittedAt !== null).length
  return round2(submitted / reviews.length)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
