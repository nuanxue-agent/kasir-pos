import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, queryOne } from '@/lib/db'

function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status })
}
function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

// GET /api/bundles/:id/items
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as { stores?: { id: string }[] }

    const { id } = await params

    const bundle = await queryOne<any>(`SELECT * FROM ProductBundle WHERE id = ?`, [id])
    if (!bundle) return err('Bundle not found', 404)

    const hasAccess = user.stores?.some(s => s.id === bundle.storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    const items = await query(
      `SELECT bi.id, bi.bundleId, bi.productId, bi.qty,
              p.name as productName, p.price as productPrice, p.stock, p.trackStock
       FROM BundleItem bi
       LEFT JOIN Product p ON p.id = bi.productId
       WHERE bi.bundleId = ?
       ORDER BY bi.id`,
      [id],
    )

    return ok(
      (items as any[]).map(row => ({
        id: row.id,
        bundleId: row.bundleId,
        productId: row.productId,
        qty: row.qty,
        product: row.productName
          ? {
              id: row.productId,
              name: row.productName,
              price: row.productPrice,
              stock: row.stock,
              trackStock: Boolean(row.trackStock),
            }
          : null,
      })),
    )
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
