// PATCH /api/product-variants/[id]
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { exec, queryOne, nowISO } from '@/lib/db'
import { ensureVariantTables } from '../route'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

// PATCH /api/product-variants/[id]?storeId=
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const { id } = await params
    const url = new URL(req.url)
    const storeId = url.searchParams.get('storeId')
    if (!storeId) return err('storeId required')

    const hasAccess = user.stores?.some((s: { id: string }) => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    await ensureVariantTables()

    const existing = await queryOne(`SELECT * FROM ProductVariant WHERE id = ? AND storeId = ?`, [id, storeId]) as any
    if (!existing) return err('Variant not found', 404)

    const b = (await req.json()) as any

    if (b.price !== undefined && b.price < 0) return err('price cannot be negative')
    if (b.stock !== undefined && b.stock < 0) return err('stock cannot be negative')

    const t = nowISO()
    const newPrice = b.price !== undefined ? b.price : existing.price
    const newStock = b.stock !== undefined ? b.stock : existing.stock
    const newActive = b.active !== undefined ? (b.active ? 1 : 0) : existing.active
    const newSku = b.sku !== undefined ? b.sku : existing.sku
    const newAttributes = b.attributes !== undefined
      ? JSON.stringify(b.attributes)
      : existing.attributes

    await exec(
      `UPDATE ProductVariant SET sku = ?, attributes = ?, price = ?, stock = ?, active = ?, updatedAt = ? WHERE id = ?`,
      [newSku, newAttributes, newPrice, newStock, newActive, t, id]
    )

    return ok({
      id, storeId,
      productId: existing.productId,
      sku: newSku,
      attributes: JSON.parse(newAttributes),
      price: newPrice,
      stock: newStock,
      active: Boolean(newActive),
    })
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
