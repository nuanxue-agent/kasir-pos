// POST /api/review-moderation/bulk — apply a moderation action to multiple reviews at once
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import {
  validateBulkAction,
  isValidModerationAction,
  canModerate,
  actionToStatus,
  aggregateBulkResults,
} from '@/lib/review-moderation'
import type { BulkActionResult } from '@/lib/review-moderation'
import { ensureReviewModerationTables } from '../route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const sp = req.nextUrl.searchParams
  const storeId = sp.get('storeId') ?? user.stores?.[0]?.id ?? ''
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  const b = (await req.json()) as any
  const { reviewIds, action, reason } = b

  const validationError = validateBulkAction(reviewIds, action)
  if (validationError) return err(validationError, 400, 'INVALID_FIELD')

  if (!isValidModerationAction(action)) {
    return err('action must be APPROVE, REJECT, or FLAG', 400, 'INVALID_FIELD')
  }

  await ensureReviewModerationTables()

  const t = nowISO()
  const moderatorId = user.id ?? user.email ?? 'system'
  const results: BulkActionResult[] = []

  for (const reviewId of reviewIds as string[]) {
    try {
      const reviewRows = await query(
        `SELECT id, status FROM ProductReview WHERE id = ? AND storeId = ?`,
        [reviewId, storeId],
      )

      if ((reviewRows as any[]).length === 0) {
        results.push({ reviewId, action, success: false, error: 'Review not found' })
        continue
      }

      const review = (reviewRows as any[])[0]

      if (!canModerate(review.status)) {
        results.push({
          reviewId,
          action,
          success: false,
          error: `Review already in '${review.status}' state`,
        })
        continue
      }

      const id = newId()
      const newStatus = actionToStatus(action)

      await exec(
        `INSERT INTO ReviewModeration (id, storeId, reviewId, moderatorId, action, reason, moderatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, storeId, reviewId, moderatorId, action, reason ?? null, t],
      )

      await exec(
        `UPDATE ProductReview SET status = ? WHERE id = ?`,
        [newStatus, reviewId],
      )

      results.push({ reviewId, action, success: true })
    } catch (e: any) {
      results.push({ reviewId, action, success: false, error: e?.message ?? 'Unknown error' })
    }
  }

  const summary = aggregateBulkResults(results)
  return NextResponse.json(summary)
}
