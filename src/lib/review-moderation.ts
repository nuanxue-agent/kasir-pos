/**
 * Pure business logic for review moderation.
 * No DB or Next.js imports — fully testable.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type ModerationAction = 'APPROVE' | 'REJECT' | 'FLAG'
export type AutoModRuleAction = 'FLAG' | 'REJECT'

export interface AutoModRule {
  id: string
  storeId: string
  keyword: string
  action: AutoModRuleAction
  active: boolean
}

export interface PendingReview {
  id: string
  storeId: string
  productId: string
  customerId: string
  rating: number
  comment: string | null
  verified: boolean
  status: string
  createdAt: string
}

export interface ModerationRecord {
  id: string
  storeId: string
  reviewId: string
  moderatorId: string
  action: ModerationAction
  reason: string | null
  moderatedAt: string
}

export interface BulkActionResult {
  reviewId: string
  action: ModerationAction
  success: boolean
  error?: string
}

export interface BulkActionSummary {
  total: number
  succeeded: number
  failed: number
  results: BulkActionResult[]
}

// ─── Action validation ────────────────────────────────────────────────────────

const VALID_ACTIONS: ModerationAction[] = ['APPROVE', 'REJECT', 'FLAG']

export function isValidModerationAction(action: string): action is ModerationAction {
  return VALID_ACTIONS.includes(action as ModerationAction)
}

/** Reviews in 'pending' or 'flagged' status can be moderated. */
export function canModerate(reviewStatus: string): boolean {
  return reviewStatus === 'pending' || reviewStatus === 'flagged'
}

/** Map a moderation action to the resulting review status. */
export function actionToStatus(action: ModerationAction): string {
  switch (action) {
    case 'APPROVE': return 'approved'
    case 'REJECT':  return 'rejected'
    case 'FLAG':    return 'flagged'
  }
}

// ─── Keyword matching / auto-mod ──────────────────────────────────────────────

/**
 * Check whether text contains a keyword (case-insensitive, word-boundary aware).
 * Returns true when the keyword appears anywhere in the text.
 */
export function containsKeyword(text: string, keyword: string): boolean {
  if (!text || !keyword) return false
  return text.toLowerCase().includes(keyword.toLowerCase())
}

/**
 * Run all active auto-mod rules against a review comment.
 * Returns the first matching rule (REJECT rules checked before FLAG rules
 * because REJECT has higher severity).
 */
export function applyAutoModRules(
  comment: string | null,
  rules: AutoModRule[],
): AutoModRule | null {
  if (!comment) return null
  const active = rules.filter(r => r.active)

  // Higher priority: REJECT rules first
  const rejectRules = active.filter(r => r.action === 'REJECT')
  const flagRules   = active.filter(r => r.action === 'FLAG')

  for (const rule of rejectRules) {
    if (containsKeyword(comment, rule.keyword)) return rule
  }
  for (const rule of flagRules) {
    if (containsKeyword(comment, rule.keyword)) return rule
  }

  return null
}

/**
 * Run all active rules and return every matching rule (for audit purposes).
 */
export function findAllMatchingRules(
  comment: string | null,
  rules: AutoModRule[],
): AutoModRule[] {
  if (!comment) return []
  return rules.filter(r => r.active && containsKeyword(comment, r.keyword))
}

// ─── Moderation queue filtering ───────────────────────────────────────────────

/** Filter reviews to only those awaiting moderation (pending + flagged). */
export function getPendingQueue(reviews: PendingReview[]): PendingReview[] {
  return reviews.filter(r => r.status === 'pending' || r.status === 'flagged')
}

/** Filter reviews by status. */
export function filterByStatus(reviews: PendingReview[], status: string): PendingReview[] {
  if (!status || status === 'all') return reviews
  return reviews.filter(r => r.status === status)
}

/** Sort reviews: flagged first, then by oldest-first (review oldest items first). */
export function sortQueue(reviews: PendingReview[]): PendingReview[] {
  return [...reviews].sort((a, b) => {
    if (a.status === 'flagged' && b.status !== 'flagged') return -1
    if (b.status === 'flagged' && a.status !== 'flagged') return 1
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  })
}

// ─── Bulk action aggregation ──────────────────────────────────────────────────

/** Aggregate an array of per-review results into a summary. */
export function aggregateBulkResults(results: BulkActionResult[]): BulkActionSummary {
  const succeeded = results.filter(r => r.success).length
  return {
    total: results.length,
    succeeded,
    failed: results.length - succeeded,
    results,
  }
}

/**
 * Validate a bulk action request.
 * Returns an error string or null when valid.
 */
export function validateBulkAction(
  reviewIds: unknown,
  action: unknown,
): string | null {
  if (!Array.isArray(reviewIds) || reviewIds.length === 0) {
    return 'reviewIds must be a non-empty array'
  }
  if (reviewIds.length > 100) {
    return 'Cannot process more than 100 reviews at once'
  }
  if (typeof action !== 'string' || !isValidModerationAction(action)) {
    return `action must be one of: ${VALID_ACTIONS.join(', ')}`
  }
  return null
}

// ─── Rule priority ────────────────────────────────────────────────────────────

/**
 * Given multiple matching rules, return the highest-severity one.
 * REJECT > FLAG.
 */
export function highestSeverityRule(rules: AutoModRule[]): AutoModRule | null {
  if (rules.length === 0) return null
  const reject = rules.find(r => r.action === 'REJECT')
  return reject ?? rules[0]
}
