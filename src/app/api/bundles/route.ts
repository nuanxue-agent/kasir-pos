// GET/POST /api/bundles
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

export async function ensureBundleTables() {
  await exec(`
    CREATE TABLE IF NOT EXISTS ProductBundle (
      id           TEXT PRIMARY KEY,
      storeId      TEXT NOT NULL,
      name         TEXT NOT NULL,
      description  TEXT,
      bundlePrice  REAL NOT NULL DEFAULT 0,
      discountType TEXT NOT NULL DEFAULT 'FIXED',
      discountValue REAL NOT NULL DEFAULT 0,
      active       INTEGER NOT NULL DEFAULT 1,
      validFrom    TEXT,
      validTo      TEXT,
      createdAt    TEXT NOT NULL,
      updatedAt    TEXT NOT NULL
    )
  `, [])
  await exec(`
    CREATE TABLE IF NOT EXISTS BundleItem (
      id        TEXT PRIMARY KEY,
      bundleId  TEXT NOT NULL,
      storeId   TEXT NOT NULL,
      productId TEXT NOT NULL,
      qty       INTEGER NOT NULL DEFAULT 1,
      unitPrice REAL NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL
    )
  `, [])
}

// GET /api/bundles?storeId=xxx
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const sp = req.nextUrl.searchParams
    const storeId: string = sp.get('storeId') ?? user.stores?.[0]?.id ?? ''
    if (!storeId) return err('storeId required')

    const hasAccess = (user.stores as any[])?.some((s: { id: string }) => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    await ensureBundleTables()

    const rows = await query(
      `SELECT b.*,
              GROUP_CONCAT(bi.id || ':' || bi.productId || ':' || bi.qty || ':' || bi.unitPrice) AS itemsRaw
       FROM ProductBundle b
       LEFT JOIN BundleItem bi ON bi.bundleId = b.id
       WHERE b.storeId = ?
       GROUP BY b.id
       ORDER BY b.name`,
      [storeId],
    )

    const productIds = new Set<string>()
    const parsed = (rows as any[]).map(row => {
      const items = row.itemsRaw
        ? row.itemsRaw.split(',').map((s: string) => {
            const [id, productId, qty, unitPrice] = s.split(':')
            productIds.add(productId)
            return { id, productId, qty: Number(qty), unitPrice: Number(unitPrice) }
          })
        : []
      const { itemsRaw, ...rest } = row
      return {
        ...rest,
        bundlePrice: Number(rest.bundlePrice),
        discountValue: Number(rest.discountValue),
        active: Boolean(rest.active),
        items,
      }
    })

    let productMap: Record<string, any> = {}
    if (productIds.size > 0) {
      const pids = [...productIds]
      const products = await query(
        `SELECT id, name, price, stock, trackStock FROM Product WHERE id IN (${pids.map(() => '?').join(',')})`,
        pids,
      )
      productMap = Object.fromEntries((products as any[]).map(p => [p.id, p]))
    }

    const enriched = parsed.map(b => ({
      ...b,
      items: b.items.map((i: any) => ({ ...i, product: productMap[i.productId] ?? null })),
    }))

    return ok(enriched)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}

// POST /api/bundles
// Body: { storeId?, name, description?, bundlePrice, discountType?, discountValue?,
//         active?, validFrom?, validTo?, items?: [{productId, qty, unitPrice?}][] }
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const body = (await req.json()) as any
    const storeId: string = body.storeId ?? user.stores?.[0]?.id ?? ''
    if (!storeId) return err('storeId required')

    const hasAccess = (user.stores as any[])?.some((s: { id: string }) => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    if (!body.name?.trim()) return err('name is required')
    if (body.bundlePrice === undefined || body.bundlePrice === null) return err('bundlePrice is required')
    const bundlePrice = Number(body.bundlePrice)
    if (isNaN(bundlePrice) || bundlePrice < 0) return err('bundlePrice must be a non-negative number')

    const discountType: string = body.discountType ?? 'FIXED'
    if (!['FIXED', 'PERCENTAGE'].includes(discountType)) return err("discountType must be 'FIXED' or 'PERCENTAGE'")

    const discountValue = Number(body.discountValue ?? 0)

    await ensureBundleTables()

    const bid = newId()
    const t = nowISO()

    await exec(
      `INSERT INTO ProductBundle
         (id, storeId, name, description, bundlePrice, discountType, discountValue,
          active, validFrom, validTo, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        bid, storeId, body.name.trim(), body.description ?? null,
        bundlePrice, discountType, discountValue,
        body.active !== false ? 1 : 0,
        body.validFrom ?? null, body.validTo ?? null,
        t, t,
      ],
    )

    const items: Array<{ productId: string; qty: number; unitPrice?: number }> = body.items ?? []
    for (const item of items) {
      await exec(
        `INSERT INTO BundleItem (id, bundleId, storeId, productId, qty, unitPrice, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [newId(), bid, storeId, item.productId, Number(item.qty) || 1, Number(item.unitPrice ?? 0), t],
      )
    }

    return ok({ id: bid, name: body.name.trim(), bundlePrice }, 201)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
