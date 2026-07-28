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
  await exec(`CREATE TABLE IF NOT EXISTS ProductBundle (
    id TEXT PRIMARY KEY,
    storeId TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS BundleItem (
    id TEXT PRIMARY KEY,
    bundleId TEXT NOT NULL,
    productId TEXT NOT NULL,
    qty INTEGER NOT NULL DEFAULT 1
  )`)
}

// GET /api/bundles?storeId=xxx
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)

    const storeId = await getStoreId(req)
    if (!storeId) return err('Forbidden', 403)

    await ensureTables()

    const rows = await query(
      `SELECT b.*, GROUP_CONCAT(bi.id||':'||bi.productId||':'||bi.qty) as itemsRaw
       FROM ProductBundle b
       LEFT JOIN BundleItem bi ON bi.bundleId = b.id
       WHERE b.storeId = ? AND b.active = 1
       GROUP BY b.id ORDER BY b.name`,
      [storeId],
    )

    const bundles = (rows as any[]).map(row => {
      const items = row.itemsRaw
        ? row.itemsRaw.split(',').map((s: string) => {
            const [id, productId, qty] = s.split(':')
            return { id, productId, qty: Number(qty) }
          })
        : []
      const { itemsRaw, ...rest } = row
      return { ...rest, active: Boolean(rest.active), items }
    })

    // Enrich with product details
    const productIds = [...new Set(bundles.flatMap(b => b.items.map((i: any) => i.productId)))]
    let products: any[] = []
    if (productIds.length > 0) {
      products = await query(
        `SELECT id, name, price, stock, trackStock FROM Product WHERE id IN (${productIds.map(() => '?').join(',')})`,
        productIds,
      )
    }
    const productMap = Object.fromEntries((products as any[]).map(p => [p.id, p]))
    const enriched = bundles.map(b => ({
      ...b,
      items: b.items.map((i: any) => ({ ...i, product: productMap[i.productId] ?? null })),
    }))

    return ok(enriched)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}

// POST /api/bundles
// Body: { storeId?, name, description?, price, items: [{productId, qty}][], active? }
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

    if (!body.name?.trim()) return err('name is required')
    if (body.price === undefined || body.price === null) return err('price is required')

    await ensureTables()

    const bid = newId()
    const t = nowISO()
    await exec(
      `INSERT INTO ProductBundle (id,storeId,name,description,price,active,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?)`,
      [bid, storeId, body.name.trim(), body.description ?? null, Number(body.price), body.active !== false ? 1 : 0, t, t],
    )

    const items: Array<{ productId: string; qty: number }> = body.items ?? []
    for (const item of items) {
      await exec(`INSERT INTO BundleItem (id,bundleId,productId,qty) VALUES (?,?,?,?)`, [
        newId(), bid, item.productId, Number(item.qty) || 1,
      ])
    }

    return ok({ id: bid, name: body.name.trim(), price: Number(body.price) }, 201)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
