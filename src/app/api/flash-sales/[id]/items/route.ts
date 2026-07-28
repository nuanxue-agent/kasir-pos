import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status })
}
function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

// GET /api/flash-sales/[id]/items
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)

    const { id } = await params
    const user = session.user as any

    const sales = await query(`SELECT * FROM FlashSale WHERE id = ?`, [id])
    if (!sales.length) return err('Not found', 404)
    const sale = sales[0] as any

    const hasAccess = user.stores?.some((s: any) => s.id === sale.storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    const items = await query(
      `SELECT * FROM FlashSaleItem WHERE saleId = ? ORDER BY createdAt ASC`,
      [id],
    )
    return ok(items)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}

// POST /api/flash-sales/[id]/items
// Body: { productId, originalPrice, salePrice, discountPct?, stockLimit?, active? }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)

    const { id } = await params
    const body = (await req.json()) as any
    const user = session.user as any

    const sales = await query(`SELECT * FROM FlashSale WHERE id = ?`, [id])
    if (!sales.length) return err('Not found', 404)
    const sale = sales[0] as any

    const hasAccess = user.stores?.some((s: any) => s.id === sale.storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    if (!body.productId?.trim()) return err('productId is required')
    if (body.originalPrice === undefined) return err('originalPrice is required')
    if (body.salePrice === undefined) return err('salePrice is required')

    const originalPrice = Number(body.originalPrice)
    const salePrice     = Number(body.salePrice)
    if (isNaN(originalPrice) || originalPrice < 0) return err('originalPrice must be a non-negative number')
    if (isNaN(salePrice) || salePrice < 0) return err('salePrice must be a non-negative number')

    // Derive discountPct if not provided
    const discountPct = body.discountPct !== undefined
      ? Number(body.discountPct)
      : originalPrice > 0
        ? Math.round(((originalPrice - salePrice) / originalPrice) * 10000) / 100
        : 0

    const itemId    = newId()
    const now       = nowISO()
    const stockLimit = Number(body.stockLimit ?? 0)
    const active     = body.active !== false ? 1 : 0

    await exec(
      `INSERT INTO FlashSaleItem (id, saleId, storeId, productId, originalPrice, salePrice, discountPct, stockLimit, soldQty, active, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      [itemId, id, sale.storeId, body.productId.trim(), originalPrice, salePrice, discountPct, stockLimit, active, now, now],
    )

    return ok({ id: itemId, saleId: id, storeId: sale.storeId, productId: body.productId.trim(), originalPrice, salePrice, discountPct, stockLimit, soldQty: 0, active: active === 1, createdAt: now }, 201)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
