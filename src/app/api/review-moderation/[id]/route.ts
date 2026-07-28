// PATCH /api/review-moderation/[id] — update a moderation record (e.g. change reason)
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, nowISO } from '@/lib/db'
import { isValidModerationAction, actionToStatus } from '@/lib/review-moderation'
import { ensureReviewModerationTables } from '../route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const { id } = await params
  const sp = req.nextUrl.searchParams
  const storeId = sp.get('storeId') ?? user.stores?.[0]?.id ?? ''
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureReviewModerationTables()

  const rows = await query(
    `SELECT * FROM ReviewModeration WHERE id = ? AND storeId = ?`,
    [id, storeId],
  )
  if ((rows as any[]).length === 0) return err('Moderation record not found', 404, 'NOT_FOUND')
  const record = (rows as any[])[0]

  const b = (await req.json()) as any

  const sets: string[]   = []
  const vals: unknown[]  = []

  if (b.action !== undefined) {
    if (!isValidModerationAction(b.action)) {
      return err('action must be APPROVE, REJECT, or FLAG', 400, 'INVALID_FIELD')
    }
    sets.push('action = ?')
    vals.push(b.action)

    // Sync the review status to the new action
    await exec(
      `UPDATE ProductReview SET status = ? WHERE id = ?`,
      [actionToStatus(b.action), record.reviewId],
    )
  }

  if (b.reason !== undefined) {
    sets.push('reason = ?')
    vals.push(b.reason)
  }

  if (sets.length === 0) return err('No fields to update', 400, 'MISSING_FIELD')

  sets.push('moderatedAt = ?')
  vals.push(nowISO())
  vals.push(id)

  await exec(`UPDATE ReviewModeration SET ${sets.join(', ')} WHERE id = ?`, vals)

  return NextResponse.json({ ok: true })
}
