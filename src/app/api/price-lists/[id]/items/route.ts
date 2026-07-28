// GET/POST /api/price-lists/[id]/items
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, queryOne, newId, nowISO } from '@/lib/db'
import { ensurePriceListTables } from '../../route'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

// GET /api/price-lists/[id]/items
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    await ensurePriceListTables()

    const { id } = await params
    const pl = await queryOne(`SELECT * FROM PriceList WHERE id = ?`, [id]) as any
    if (!pl) return err('Price list not found', 404)

    const hasAccess = user.stores?.some((s: { id: string }) => s.id === pl.storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    const items = await query(
      `SELECT pli.*, p.name AS productName, p.sku, p.price AS basePrice
       FROM PriceListItem pli
       LEFT JOIN Product p ON p.id = pli.productId
       WHERE pli.priceListId = ?
       ORDER BY pli.minQty ASC, pli.createdAt ASC`,
      [id]
    ) as any[]

    return ok(items)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}

// POST /api/price-lists/[id]/items
// Body: { productId, price, minQty? }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    await ensurePriceListTables()

    const { id } = await params
    const pl = await queryOne(`SELECT * FROM PriceList WHERE id = ?`, [id]) as any
    if (!pl) return err('Price list not found', 404)

    const hasAccess = user.stores?.some((s: { id: string }) => s.id === pl.storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    const b = (await req.json()) as any
    if (!b.productId) return err('productId required')
    if (b.price == null || b.price < 0) return err('price must be >= 0')

    const t = nowISO()
    const itemId = newId()
    const minQty = b.minQty ?? 1

    await exec(
      `INSERT INTO PriceListItem (id, priceListId, storeId, productId, price, minQty, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [itemId, id, pl.storeId, b.productId, b.price, minQty, t, t]
    )

    return ok({ id: itemId }, 201)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
