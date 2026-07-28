// GET/POST /api/product-variants
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

export async function ensureVariantTables() {
  await exec(`CREATE TABLE IF NOT EXISTS ProductVariant (
    id         TEXT PRIMARY KEY,
    storeId    TEXT NOT NULL,
    productId  TEXT NOT NULL,
    sku        TEXT NOT NULL,
    attributes TEXT NOT NULL DEFAULT '{}',
    price      REAL NOT NULL DEFAULT 0,
    stock      REAL NOT NULL DEFAULT 0,
    active     INTEGER NOT NULL DEFAULT 1,
    createdAt  TEXT NOT NULL,
    updatedAt  TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS VariantAttribute (
    id        TEXT PRIMARY KEY,
    storeId   TEXT NOT NULL,
    productId TEXT NOT NULL,
    name      TEXT NOT NULL,
    values    TEXT NOT NULL DEFAULT '[]',
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`)
}

// GET /api/product-variants?storeId=&productId=
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const url = new URL(req.url)
    const storeId = url.searchParams.get('storeId')
    const productId = url.searchParams.get('productId')
    if (!storeId) return err('storeId required')

    const hasAccess = user.stores?.some((s: { id: string }) => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    await ensureVariantTables()

    let sql = `SELECT * FROM ProductVariant WHERE storeId = ?`
    const params: unknown[] = [storeId]
    if (productId) { sql += ` AND productId = ?`; params.push(productId) }
    sql += ` ORDER BY createdAt ASC`

    const rows = await query(sql, params) as any[]
    const variants = rows.map(r => ({
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
// Body: { storeId, productId, sku, attributes, price, stock, active }
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    await ensureVariantTables()

    const b = (await req.json()) as any
    if (!b.storeId) return err('storeId required')
    if (!b.productId) return err('productId required')
    if (!b.sku) return err('sku required')

    const hasAccess = user.stores?.some((s: { id: string }) => s.id === b.storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    if (b.price !== undefined && b.price < 0) return err('price cannot be negative')
    if (b.stock !== undefined && b.stock < 0) return err('stock cannot be negative')

    const t = nowISO()
    const id = newId()

    await exec(
      `INSERT INTO ProductVariant (id, storeId, productId, sku, attributes, price, stock, active, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, b.storeId, b.productId, b.sku,
        JSON.stringify(b.attributes ?? {}),
        b.price ?? 0, b.stock ?? 0,
        b.active !== false ? 1 : 0,
        t, t,
      ]
    )

    return ok({
      id, storeId: b.storeId, productId: b.productId,
      sku: b.sku, attributes: b.attributes ?? {},
      price: b.price ?? 0, stock: b.stock ?? 0,
      active: b.active !== false,
    }, 201)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
