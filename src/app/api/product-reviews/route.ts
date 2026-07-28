// GET  /api/product-reviews?storeId=&productId=&status=
// POST /api/product-reviews
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import { isVerifiedPurchase, clampRating } from '@/lib/product-reviews-logic'

function ok(data: unknown) { return NextResponse.json(data) }
function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

async function ensureTable() {
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
  await exec(`CREATE INDEX IF NOT EXISTS idx_pr_store   ON ProductReview(storeId)`)
  await exec(`CREATE INDEX IF NOT EXISTS idx_pr_product ON ProductReview(productId)`)
  await exec(`CREATE INDEX IF NOT EXISTS idx_pr_status  ON ProductReview(status)`)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')

  const sp = req.nextUrl.searchParams
  const storeId   = sp.get('storeId') ?? ''
  const productId = sp.get('productId') ?? ''
  const status    = sp.get('status') ?? ''

  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureTable()

  const where: string[]   = ['storeId = ?']
  const params: unknown[] = [storeId]

  if (productId) { where.push('productId = ?'); params.push(productId) }
  if (status)    { where.push('status = ?');    params.push(status) }

  const rows = await query(
    `SELECT * FROM ProductReview WHERE ${where.join(' AND ')} ORDER BY createdAt DESC`,
    params,
  )

  const reviews = (rows as any[]).map(r => ({
    ...r,
    verified: Boolean(r.verified),
  }))

  return ok(reviews)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')

  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body) return err('Invalid JSON', 400, 'INVALID_JSON')

  const { storeId, productId, customerId, orderId, rating, comment } = body as {
    storeId?: string; productId?: string; customerId?: string
    orderId?: string; rating?: number; comment?: string
  }
  if (!storeId)   return err('storeId required',   400, 'MISSING_FIELD')
  if (!productId) return err('productId required', 400, 'MISSING_FIELD')
  if (!customerId) return err('customerId required', 400, 'MISSING_FIELD')
  if (!rating)    return err('rating required',    400, 'MISSING_FIELD')

  const safeRating = clampRating(Number(rating))
  const verified   = isVerifiedPurchase({ orderId: orderId ?? null }) ? 1 : 0

  await ensureTable()

  // One review per customer per product
  const existing = await query(
    `SELECT id FROM ProductReview WHERE storeId = ? AND productId = ? AND customerId = ? LIMIT 1`,
    [storeId, productId, customerId],
  )
  if ((existing as any[]).length > 0) return err('Review already submitted', 409, 'DUPLICATE')

  const id        = newId()
  const createdAt = nowISO()

  await exec(
    `INSERT INTO ProductReview (id, storeId, productId, customerId, orderId, rating, comment, verified, status, helpful, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?)`,
    [id, storeId, productId, customerId, orderId ?? null, safeRating, comment ?? null, verified, createdAt],
  )

  return ok({ id, storeId, productId, customerId, orderId: orderId ?? null, rating: safeRating, comment: comment ?? null, verified: Boolean(verified), status: 'pending', helpful: 0, createdAt })
}
