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

async function ensureSpecTable() {
  await exec(`CREATE TABLE IF NOT EXISTS ProductSpec (
    id           TEXT PRIMARY KEY,
    storeId      TEXT NOT NULL,
    productId    TEXT NOT NULL,
    specName     TEXT NOT NULL,
    specValue    TEXT NOT NULL DEFAULT '',
    specGroup    TEXT NOT NULL DEFAULT 'General',
    displayOrder INTEGER NOT NULL DEFAULT 0,
    createdAt    TEXT NOT NULL,
    updatedAt    TEXT NOT NULL
  )`)
}

// GET /api/product-specs?storeId=&productId=
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)

    const storeId = await getStoreId(req)
    if (!storeId) return err('Forbidden', 403)

    const productId = new URL(req.url).searchParams.get('productId')

    await ensureSpecTable()

    const rows = productId
      ? await query(
          `SELECT * FROM ProductSpec WHERE storeId = ? AND productId = ? ORDER BY specGroup, displayOrder, specName`,
          [storeId, productId],
        )
      : await query(
          `SELECT * FROM ProductSpec WHERE storeId = ? ORDER BY productId, specGroup, displayOrder, specName`,
          [storeId],
        )

    return ok(rows as any[])
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}

// POST /api/product-specs
// Body: { storeId?, productId, specName, specValue, specGroup?, displayOrder? }
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
    if (!body.specName?.trim()) return err('specName is required')

    await ensureSpecTable()

    const t = nowISO()
    const id = newId()

    await exec(
      `INSERT INTO ProductSpec (id, storeId, productId, specName, specValue, specGroup, displayOrder, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        storeId,
        body.productId.trim(),
        body.specName.trim(),
        body.specValue ?? '',
        body.specGroup ?? 'General',
        Number(body.displayOrder ?? 0),
        t,
        t,
      ],
    )

    return ok({ id }, 201)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
