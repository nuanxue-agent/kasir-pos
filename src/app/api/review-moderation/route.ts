// GET  /api/review-moderation?storeId=&status=&productId=
// POST /api/review-moderation — submit a moderation action on a single review
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import {
  isValidModerationAction,
  canModerate,
  actionToStatus,
  applyAutoModRules,
} from '@/lib/review-moderation'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function ensureReviewModerationTables() {
  await exec(`CREATE TABLE IF NOT EXISTS ReviewModeration (
    id          TEXT PRIMARY KEY,
    storeId     TEXT NOT NULL,
    reviewId    TEXT NOT NULL,
    moderatorId TEXT NOT NULL,
    action      TEXT NOT NULL,
    reason      TEXT,
    moderatedAt TEXT NOT NULL
  )`)
  await exec(`CREATE INDEX IF NOT EXISTS idx_rm_store  ON ReviewModeration(storeId)`)
  await exec(`CREATE INDEX IF NOT EXISTS idx_rm_review ON ReviewModeration(reviewId)`)

  await exec(`CREATE TABLE IF NOT EXISTS AutoModRule (
    id        TEXT    PRIMARY KEY,
    storeId   TEXT    NOT NULL,
    keyword   TEXT    NOT NULL,
    action    TEXT    NOT NULL DEFAULT 'FLAG',
    active    INTEGER NOT NULL DEFAULT 1,
    createdAt TEXT    NOT NULL,
    updatedAt TEXT    NOT NULL
  )`)
  await exec(`CREATE INDEX IF NOT EXISTS idx_amr_store ON AutoModRule(storeId)`)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const sp = req.nextUrl.searchParams
  const storeId   = sp.get('storeId') ?? user.stores?.[0]?.id ?? ''
  const status    = sp.get('status') ?? ''
  const productId = sp.get('productId') ?? ''

  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureReviewModerationTables()

  // Ensure ProductReview table exists (may not be set up yet)
  await exec(`CREATE TABLE IF NOT EXISTS ProductReview (
    id         TEXT    PRIMARY KEY,
    storeId    TEXT    NOT NULL,
    productId  TEXT    NOT NULL,
    customerId TEXT    NOT NULL,
    orderId    TEXT,
    rating     INTEGER NOT NULL DEFAULT 3,
    comment    TEXT,
    verified   INTEGER NOT NULL DEFAULT 0,
    status     TEXT    NOT NULL DEFAULT 'pending',
    helpful    INTEGER NOT NULL DEFAULT 0,
    createdAt  TEXT    NOT NULL
  )`)

  const where: string[]   = ['pr.storeId = ?']
  const params: unknown[] = [storeId]

  if (status)    { where.push('pr.status = ?');    params.push(status) }
  if (productId) { where.push('pr.productId = ?'); params.push(productId) }

  const rows = await query(
    `SELECT pr.*,
            rm.id          AS moderationId,
            rm.action      AS lastAction,
            rm.reason      AS lastReason,
            rm.moderatedAt AS lastModeratedAt,
            rm.moderatorId AS lastModeratorId
     FROM ProductReview pr
     LEFT JOIN ReviewModeration rm
       ON rm.reviewId = pr.id
       AND rm.moderatedAt = (
         SELECT MAX(m2.moderatedAt) FROM ReviewModeration m2 WHERE m2.reviewId = pr.id
       )
     WHERE ${where.join(' AND ')}
     ORDER BY
       CASE pr.status WHEN 'flagged' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
       pr.createdAt ASC`,
    params,
  )

  const reviews = (rows as any[]).map(r => ({
    ...r,
    verified: Boolean(r.verified),
  }))

  return NextResponse.json(reviews)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const sp = req.nextUrl.searchParams
  const storeId = sp.get('storeId') ?? user.stores?.[0]?.id ?? ''
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  const b = (await req.json()) as any
  const { reviewId, action, reason } = b

  if (!reviewId) return err("'reviewId' is required", 400, 'MISSING_FIELD')
  if (!action)   return err("'action' is required",   400, 'MISSING_FIELD')
  if (!isValidModerationAction(action)) {
    return err(`action must be APPROVE, REJECT, or FLAG`, 400, 'INVALID_FIELD')
  }

  await ensureReviewModerationTables()

  // Load the review
  const reviewRows = await query(
    `SELECT * FROM ProductReview WHERE id = ? AND storeId = ?`,
    [reviewId, storeId],
  )
  if ((reviewRows as any[]).length === 0) {
    return err('Review not found', 404, 'NOT_FOUND')
  }
  const review = (reviewRows as any[])[0]

  if (!canModerate(review.status)) {
    return err(
      `Review is already in '${review.status}' state and cannot be moderated`,
      400,
      'INVALID_STATE',
    )
  }

  const t = nowISO()
  const id = newId()
  const moderatorId = user.id ?? user.email ?? 'system'
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

  return NextResponse.json({ id, reviewId, action, newStatus }, { status: 201 })
}
