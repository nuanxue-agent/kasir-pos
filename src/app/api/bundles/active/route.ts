// GET /api/bundles/active — returns active, currently-valid bundles for POS
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec } from '@/lib/db'
import { ensureBundleTables } from '../route'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

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

    const now = new Date().toISOString()

    // Active bundles: active=1, and either no validity window or current time is within it
    const rows = await query(
      `SELECT b.*,
              GROUP_CONCAT(bi.id || ':' || bi.productId || ':' || bi.qty || ':' || bi.unitPrice) AS itemsRaw
       FROM ProductBundle b
       LEFT JOIN BundleItem bi ON bi.bundleId = b.id
       WHERE b.storeId = ?
         AND b.active = 1
         AND (b.validFrom IS NULL OR b.validFrom <= ?)
         AND (b.validTo   IS NULL OR b.validTo   >  ?)
       GROUP BY b.id
       ORDER BY b.name`,
      [storeId, now, now],
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
        active: true,
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
