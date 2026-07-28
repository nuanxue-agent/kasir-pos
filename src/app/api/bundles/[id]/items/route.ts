// GET/POST /api/bundles/[id]/items
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, queryOne, exec, newId, nowISO } from '@/lib/db'
import { ensureBundleTables } from '../../route'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

async function getBundle(bundleId: string, userStores: { id: string }[]) {
  await ensureBundleTables()
  const bundle = await queryOne<any>(`SELECT * FROM ProductBundle WHERE id = ?`, [bundleId])
  if (!bundle) return null
  const hasAccess = userStores?.some(s => s.id === bundle.storeId) ?? false
  return hasAccess ? bundle : null
}

// GET /api/bundles/[id]/items
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const { id } = await params
    const bundle = await getBundle(id, user.stores ?? [])
    if (!bundle) return err('Bundle not found', 404)

    const items = await query(
      `SELECT bi.id, bi.bundleId, bi.storeId, bi.productId, bi.qty, bi.unitPrice,
              p.name AS productName, p.price AS productPrice, p.stock, p.trackStock
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
        storeId: row.storeId,
        productId: row.productId,
        qty: Number(row.qty),
        unitPrice: Number(row.unitPrice),
        product: row.productName
          ? {
              id: row.productId,
              name: row.productName,
              price: Number(row.productPrice),
              stock: Number(row.stock),
              trackStock: Boolean(row.trackStock),
            }
          : null,
      })),
    )
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}

// POST /api/bundles/[id]/items
// Body: { productId, qty, unitPrice? }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const { id } = await params
    const bundle = await getBundle(id, user.stores ?? [])
    if (!bundle) return err('Bundle not found', 404)

    const body = (await req.json()) as any
    if (!body.productId) return err('productId is required')
    const qty = Number(body.qty) || 1
    const unitPrice = Number(body.unitPrice ?? 0)

    const itemId = newId()
    const t = nowISO()
    await exec(
      `INSERT INTO BundleItem (id, bundleId, storeId, productId, qty, unitPrice, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [itemId, id, bundle.storeId, body.productId, qty, unitPrice, t],
    )

    return ok({ id: itemId, bundleId: id, productId: body.productId, qty, unitPrice }, 201)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
