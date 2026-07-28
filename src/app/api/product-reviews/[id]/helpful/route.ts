// POST /api/product-reviews/:id/helpful
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { queryOne, exec } from '@/lib/db'
import { incrementHelpful } from '@/lib/product-reviews-logic'

function ok(data: unknown) { return NextResponse.json(data) }
function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')

  const { id } = await params
  const review = await queryOne<any>(
    `SELECT * FROM ProductReview WHERE id = ? LIMIT 1`,
    [id],
  )
  if (!review) return err('Review not found', 404, 'NOT_FOUND')
  if (review.status !== 'approved') return err('Review not approved', 422, 'NOT_APPROVED')

  const newHelpful = incrementHelpful(review.helpful ?? 0)
  await exec(`UPDATE ProductReview SET helpful = ? WHERE id = ?`, [newHelpful, id])

  return ok({ id, helpful: newHelpful })
}
