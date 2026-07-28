// GET /api/products/:id/rating-summary
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'
import { buildRatingSummary } from '@/lib/product-reviews-logic'
import type { ProductReview } from '@/lib/product-reviews-logic'

function ok(data: unknown) { return NextResponse.json(data) }
function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')

  const { id: productId } = await params

  let rows: any[]
  try {
    rows = await query(
      `SELECT * FROM ProductReview WHERE productId = ?`,
      [productId],
    )
  } catch {
    // Table may not exist yet — return empty summary
    rows = []
  }

  const reviews = (rows as any[]).map(r => ({
    ...r,
    verified: Boolean(r.verified),
  })) as ProductReview[]

  const summary = buildRatingSummary(productId, reviews)
  return ok(summary)
}
