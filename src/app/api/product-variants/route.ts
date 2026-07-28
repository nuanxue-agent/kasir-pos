import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status })
}
function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

async function getStoreId(req: NextRequest): Promise<string | null> {
  const session = await auth()
  if (!session?.user) return null
  const user = session.user as { stores?: { id: string }[] }
  const urlStoreId = new URL(req.url).searchParams.get('storeId')
  if (urlStoreId) {
    const hasAccess = user.stores?.some(s => s.id === urlStoreId) ?? false
    return hasAccess ? urlStoreId : null
  }
  return user.stores?.[0]?.id ?? null
}

async function ensureVariantTable() {
  await exec(`CREATE TABLE IF NOT EXISTS ProductVariant (
    id         TEXT PRIMARY KEY,
    storeId    TEXT NOT NULL,
    productId  TEXT NOT NULL,
    attributes TEXT NOT NULL DEFAULT '{}',
    sku        TEXT,
    price      REAL NOT NULL DEFAULT 0,
    stock      INTEGER NOT NULL DEFAULT 0,
    active     INTEGER NOT NULL DEFAULT 1,
    createdAt  TEXT NOT NULL,
    updatedAt  TEXT NOT NULL
  )`)
}

// GET /api/product-variants?storeId=&productId=
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)

    const storeId = await getStoreId(req)
    if (!storeId) return err('Forbidden', 403)

    const productId = new URL(req.url).searchParams.get('productId')

    await ensureVariantTable()

    const rows = productId
      ? await query(
          `SELECT * FROM ProductVariant WHERE storeId = ? AND productId = ? AND active = 1 ORDER BY sku`,
          [storeId, productId],
        )
      : await query(
          `SELECT * FROM ProductVariant WHERE storeId = ? AND active = 1 ORDER BY productId, sku`,
          [storeId],
        )

    const variants = (rows as any[]).map(r => ({
      ...r,
      attributes: JSON.parse(r.attributes ?? '{}'),
      active: Boolean(r.active),
    }))

    return ok(variants)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}

// POST /api/product-variants
// Body: { storeId?, productId, variants: Array<{ attributes, sku?, price, stock }> }
// Supports bulk create from matrix — upserts by productId + attributes JSON
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)

    const body = (await req.json()) as any
    const user = session.user as { stores?: { id: string }[] }
    const storeId: string = body.storeId ?? user.stores?.[0]?.id ?? ''
    if (!storeId) return err('storeId required')

    const hasAccess = user.stores?.some(s => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    if (!body.productId?.trim()) return err('productId is required')
    if (!Array.isArray(body.variants) || body.variants.length === 0)
      return err('variants must be a non-empty array')

    await ensureVariantTable()

    const t = nowISO()
    const created: string[] = []

    for (const v of body.variants as any[]) {
      const attrsStr = JSON.stringify(v.attributes ?? {})

      // Upsert: check if variant with same productId+attributes already exists
      const existing = await query(
        `SELECT id FROM ProductVariant WHERE productId = ? AND attributes = ?`,
        [body.productId.trim(), attrsStr],
      )

      if ((existing as any[]).length > 0) {
        const existingId = (existing as any[])[0].id
        await exec(
          `UPDATE ProductVariant SET price=?, stock=?, sku=?, active=1, updatedAt=? WHERE id=?`,
          [Number(v.price ?? 0), Number(v.stock ?? 0), v.sku ?? null, t, existingId],
        )
        created.push(existingId)
      } else {
        const id = newId()
        await exec(
          `INSERT INTO ProductVariant (id,storeId,productId,attributes,sku,price,stock,active,createdAt,updatedAt)
           VALUES (?,?,?,?,?,?,?,1,?,?)`,
          [id, storeId, body.productId.trim(), attrsStr, v.sku ?? null, Number(v.price ?? 0), Number(v.stock ?? 0), t, t],
        )
        created.push(id)
      }
    }

    return ok({ created: created.length, ids: created }, 201)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
