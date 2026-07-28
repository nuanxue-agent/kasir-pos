import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, queryOne } from '@/lib/db'

function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status })
}
function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

/**
 * GET /api/product-bundles/:id/availability
 *
 * Returns whether the bundle is available for sale — all tracked components
 * must have sufficient stock (qty >= bundleItem.qty).
 *
 * Response:
 *   { available: boolean, items: Array<{ productId, name, required, stock, available }> }
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as { stores?: { id: string }[] }

    const { id } = await params

    const bundle = await queryOne<{ id: string; storeId: string; active: number }>(
      `SELECT id, storeId, active FROM ProductBundle WHERE id = ?`,
      [id],
    )
    if (!bundle) return err('Bundle not found', 404)

    const hasAccess = user.stores?.some(s => s.id === bundle.storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    if (!bundle.active) {
      return ok({ available: false, reason: 'Bundle is inactive', items: [] })
    }

    // Load bundle items joined with product stock
    const items = await query<{
      productId: string
      name: string
      price: number
      stock: number
      trackStock: number
      qty: number
    }>(
      `SELECT bi.productId, p.name, p.price, p.stock, p.trackStock, bi.qty
       FROM BundleItem bi
       JOIN Product p ON p.id = bi.productId
       WHERE bi.bundleId = ?`,
      [id],
    )

    const result = (items as any[]).map(item => {
      const tracked = Boolean(item.trackStock)
      const sufficient = !tracked || item.stock >= item.qty
      return {
        productId: item.productId,
        name: item.name,
        price: item.price,
        required: item.qty,
        stock: item.stock,
        trackStock: tracked,
        available: sufficient,
      }
    })

    const available = result.every(i => i.available)

    return ok({ available, items: result })
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
