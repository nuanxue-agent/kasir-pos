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

async function ensureTables() {
  await exec(`CREATE TABLE IF NOT EXISTS ProductAttribute (
    id        TEXT PRIMARY KEY,
    storeId   TEXT NOT NULL,
    productId TEXT NOT NULL,
    name      TEXT NOT NULL,
    values    TEXT NOT NULL DEFAULT '[]',
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`)
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

// GET /api/product-attributes?storeId=&productId=
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)

    const storeId = await getStoreId(req)
    if (!storeId) return err('Forbidden', 403)

    const productId = new URL(req.url).searchParams.get('productId')

    await ensureTables()

    const rows = productId
      ? await query(
          `SELECT * FROM ProductAttribute WHERE storeId = ? AND productId = ? ORDER BY name`,
          [storeId, productId],
        )
      : await query(
          `SELECT * FROM ProductAttribute WHERE storeId = ? ORDER BY productId, name`,
          [storeId],
        )

    const attrs = (rows as any[]).map(r => ({
      ...r,
      values: JSON.parse(r.values ?? '[]'),
    }))

    return ok(attrs)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}

// POST /api/product-attributes
// Body: { storeId?, productId, name, values: string[] }
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
    if (!body.name?.trim()) return err('name is required')
    if (!Array.isArray(body.values) || body.values.length === 0)
      return err('values must be a non-empty array')

    await ensureTables()

    const id = newId()
    const t = nowISO()
    await exec(
      `INSERT INTO ProductAttribute (id,storeId,productId,name,values,createdAt,updatedAt)
       VALUES (?,?,?,?,?,?,?)`,
      [id, storeId, body.productId.trim(), body.name.trim(), JSON.stringify(body.values), t, t],
    )

    return ok({ id, productId: body.productId.trim(), name: body.name.trim(), values: body.values }, 201)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
