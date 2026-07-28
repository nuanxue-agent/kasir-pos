// PATCH /api/product-reviews/:id  { status, approved }
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { queryOne, exec } from '@/lib/db'
import { applyModerationAction, canModerate } from '@/lib/product-reviews-logic'

function ok(data: unknown) { return NextResponse.json(data) }
function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')

  const user = session.user as any
  const role = user.role ?? user.stores?.[0]?.role ?? 'cashier'
  if (!canModerate(role)) return err('Forbidden', 403, 'FORBIDDEN')

  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body) return err('Invalid JSON', 400, 'INVALID_JSON')

  const { id } = await params
  const review = await queryOne<any>(
    `SELECT * FROM ProductReview WHERE id = ? LIMIT 1`,
    [id],
  )
  if (!review) return err('Review not found', 404, 'NOT_FOUND')

  const bodyTyped = body as { approved?: boolean; status?: string }
  // Accept either { approved: true/false } or { status: 'approved'|'rejected' }
  let newStatus: string
  try {
    if (typeof bodyTyped.approved === 'boolean') {
      newStatus = applyModerationAction(review.status, bodyTyped.approved ? 'approve' : 'reject')
    } else if (bodyTyped.status) {
      newStatus = applyModerationAction(review.status, bodyTyped.status === 'approved' ? 'approve' : 'reject')
    } else {
      return err('status or approved required', 400, 'MISSING_FIELD')
    }
  } catch (e: any) {
    return err(e.message, 422, 'INVALID_TRANSITION')
  }

  await exec(`UPDATE ProductReview SET status = ? WHERE id = ?`, [newStatus, id])
  return ok({ ...review, status: newStatus, verified: Boolean(review.verified) })
}
