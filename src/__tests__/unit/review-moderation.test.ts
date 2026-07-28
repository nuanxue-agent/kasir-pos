import { describe, it, expect } from 'vitest'
import {
  containsKeyword,
  applyAutoModRules,
  findAllMatchingRules,
  getPendingQueue,
  filterByStatus,
  sortQueue,
  aggregateBulkResults,
  validateBulkAction,
  isValidModerationAction,
  canModerate,
  actionToStatus,
  highestSeverityRule,
} from '@/lib/review-moderation'
import type { AutoModRule, PendingReview, BulkActionResult } from '@/lib/review-moderation'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const flagRule: AutoModRule = {
  id: 'r1', storeId: 's1', keyword: 'spam', action: 'FLAG', active: true,
}
const rejectRule: AutoModRule = {
  id: 'r2', storeId: 's1', keyword: 'scam', action: 'REJECT', active: true,
}
const inactiveRule: AutoModRule = {
  id: 'r3', storeId: 's1', keyword: 'bad', action: 'FLAG', active: false,
}
const flagRule2: AutoModRule = {
  id: 'r4', storeId: 's1', keyword: 'hate', action: 'FLAG', active: true,
}

function makeReview(overrides: Partial<PendingReview> = {}): PendingReview {
  return {
    id: 'rev1',
    storeId: 's1',
    productId: 'p1',
    customerId: 'c1',
    rating: 3,
    comment: 'Produk bagus',
    verified: false,
    status: 'pending',
    createdAt: '2026-01-01T08:00:00.000Z',
    ...overrides,
  }
}

// ─── 1. Keyword matching for auto-mod ────────────────────────────────────────

describe('containsKeyword', () => {
  it('should match a keyword case-insensitively', () => {
    expect(containsKeyword('This is SPAM content', 'spam')).toBe(true)
  })

  it('should return false when keyword is not present', () => {
    expect(containsKeyword('Nice product', 'spam')).toBe(false)
  })

  it('should return false for empty comment', () => {
    expect(containsKeyword('', 'spam')).toBe(false)
  })

  it('should match partial occurrences', () => {
    expect(containsKeyword('spammer review', 'spam')).toBe(true)
  })
})

// ─── 2. Auto-mod rule application ────────────────────────────────────────────

describe('applyAutoModRules', () => {
  it('should return the matching REJECT rule when comment contains its keyword', () => {
    const result = applyAutoModRules('this is a scam product', [flagRule, rejectRule])
    expect(result).not.toBeNull()
    expect(result!.action).toBe('REJECT')
  })

  it('should return FLAG rule when only a FLAG keyword matches', () => {
    const result = applyAutoModRules('this is spam', [flagRule, rejectRule])
    expect(result).not.toBeNull()
    expect(result!.action).toBe('FLAG')
  })

  it('should skip inactive rules', () => {
    const result = applyAutoModRules('this is bad', [inactiveRule])
    expect(result).toBeNull()
  })

  it('should return null when no rules match', () => {
    const result = applyAutoModRules('great product, very satisfied', [flagRule, rejectRule])
    expect(result).toBeNull()
  })

  it('should return null for null comment', () => {
    const result = applyAutoModRules(null, [flagRule, rejectRule])
    expect(result).toBeNull()
  })
})

// ─── 3. Rule priority: REJECT beats FLAG ─────────────────────────────────────

describe('Rule priority', () => {
  it('REJECT rule should take priority over FLAG when both match', () => {
    // comment contains both 'spam' (FLAG) and 'scam' (REJECT)
    const result = applyAutoModRules('spam scam combo', [flagRule, rejectRule])
    expect(result!.action).toBe('REJECT')
  })

  it('highestSeverityRule should return REJECT over FLAG', () => {
    const result = highestSeverityRule([flagRule, rejectRule])
    expect(result!.action).toBe('REJECT')
  })

  it('highestSeverityRule should return the only rule when there is one match', () => {
    const result = highestSeverityRule([flagRule])
    expect(result!.action).toBe('FLAG')
  })

  it('highestSeverityRule returns null for empty array', () => {
    expect(highestSeverityRule([])).toBeNull()
  })
})

// ─── 4. Find all matching rules ───────────────────────────────────────────────

describe('findAllMatchingRules', () => {
  it('should return all rules whose keywords appear in the comment', () => {
    const matches = findAllMatchingRules('spam and hate', [flagRule, rejectRule, inactiveRule, flagRule2])
    // 'spam' → flagRule, 'hate' → flagRule2; inactiveRule skipped; rejectRule 'scam' not matched
    expect(matches).toHaveLength(2)
    expect(matches.map(r => r.id).sort()).toEqual(['r1', 'r4'].sort())
  })
})

// ─── 5. Moderation queue filtering ───────────────────────────────────────────

describe('getPendingQueue', () => {
  it('should include pending and flagged reviews only', () => {
    const reviews = [
      makeReview({ id: 'r1', status: 'pending' }),
      makeReview({ id: 'r2', status: 'flagged' }),
      makeReview({ id: 'r3', status: 'approved' }),
      makeReview({ id: 'r4', status: 'rejected' }),
    ]
    const queue = getPendingQueue(reviews)
    expect(queue).toHaveLength(2)
    expect(queue.map(r => r.id).sort()).toEqual(['r1', 'r2'].sort())
  })
})

describe('filterByStatus', () => {
  it('should return all reviews when status is "all"', () => {
    const reviews = [makeReview({ status: 'pending' }), makeReview({ id: 'r2', status: 'approved' })]
    expect(filterByStatus(reviews, 'all')).toHaveLength(2)
  })

  it('should filter by exact status', () => {
    const reviews = [
      makeReview({ id: 'r1', status: 'pending' }),
      makeReview({ id: 'r2', status: 'approved' }),
    ]
    expect(filterByStatus(reviews, 'approved')).toHaveLength(1)
    expect(filterByStatus(reviews, 'approved')[0].id).toBe('r2')
  })
})

describe('sortQueue', () => {
  it('should sort flagged reviews before pending', () => {
    const reviews = [
      makeReview({ id: 'r1', status: 'pending',  createdAt: '2026-01-01T10:00:00.000Z' }),
      makeReview({ id: 'r2', status: 'flagged',  createdAt: '2026-01-01T12:00:00.000Z' }),
    ]
    const sorted = sortQueue(reviews)
    expect(sorted[0].id).toBe('r2') // flagged first
    expect(sorted[1].id).toBe('r1')
  })

  it('should sort oldest first within same status', () => {
    const reviews = [
      makeReview({ id: 'r1', status: 'pending', createdAt: '2026-01-03T00:00:00.000Z' }),
      makeReview({ id: 'r2', status: 'pending', createdAt: '2026-01-01T00:00:00.000Z' }),
    ]
    const sorted = sortQueue(reviews)
    expect(sorted[0].id).toBe('r2') // older first
  })
})

// ─── 6. Bulk action aggregation ───────────────────────────────────────────────

describe('aggregateBulkResults', () => {
  it('should correctly count succeeded and failed results', () => {
    const results: BulkActionResult[] = [
      { reviewId: 'r1', action: 'APPROVE', success: true },
      { reviewId: 'r2', action: 'APPROVE', success: false, error: 'Not found' },
      { reviewId: 'r3', action: 'APPROVE', success: true },
    ]
    const summary = aggregateBulkResults(results)
    expect(summary.total).toBe(3)
    expect(summary.succeeded).toBe(2)
    expect(summary.failed).toBe(1)
  })
})

// ─── 7. Bulk action validation ────────────────────────────────────────────────

describe('validateBulkAction', () => {
  it('should return error when reviewIds is empty', () => {
    expect(validateBulkAction([], 'APPROVE')).not.toBeNull()
  })

  it('should return error when reviewIds is not an array', () => {
    expect(validateBulkAction('r1', 'APPROVE')).not.toBeNull()
  })

  it('should return error for invalid action', () => {
    expect(validateBulkAction(['r1'], 'PUBLISH')).not.toBeNull()
  })

  it('should return null for valid input', () => {
    expect(validateBulkAction(['r1', 'r2'], 'APPROVE')).toBeNull()
  })

  it('should return error when more than 100 reviews', () => {
    const ids = Array.from({ length: 101 }, (_, i) => `r${i}`)
    expect(validateBulkAction(ids, 'REJECT')).not.toBeNull()
  })
})

// ─── 8. Action validation ─────────────────────────────────────────────────────

describe('isValidModerationAction', () => {
  it('should accept APPROVE, REJECT, FLAG', () => {
    expect(isValidModerationAction('APPROVE')).toBe(true)
    expect(isValidModerationAction('REJECT')).toBe(true)
    expect(isValidModerationAction('FLAG')).toBe(true)
  })

  it('should reject unknown actions', () => {
    expect(isValidModerationAction('PUBLISH')).toBe(false)
    expect(isValidModerationAction('delete')).toBe(false)
    expect(isValidModerationAction('')).toBe(false)
  })
})

describe('canModerate', () => {
  it('should allow moderation of pending and flagged reviews', () => {
    expect(canModerate('pending')).toBe(true)
    expect(canModerate('flagged')).toBe(true)
  })

  it('should disallow moderation of already-processed reviews', () => {
    expect(canModerate('approved')).toBe(false)
    expect(canModerate('rejected')).toBe(false)
  })
})

describe('actionToStatus', () => {
  it('should map actions to correct review statuses', () => {
    expect(actionToStatus('APPROVE')).toBe('approved')
    expect(actionToStatus('REJECT')).toBe('rejected')
    expect(actionToStatus('FLAG')).toBe('flagged')
  })
})
