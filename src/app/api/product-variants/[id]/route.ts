import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, nowISO } from '@/lib/db'

function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status })
}
function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

// PATCH /api/product-variants/[id]
// Body: { price?, stock?, sku?, active?, attributes? }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)

    const { id } = await params
    const body = (await req.json()) as any
    const user = session.user as { stores?: { id: string }[] }

    const rows = await query(`SELECT * FROM ProductVariant WHERE id = ?`, [id])
    const existing = (rows as any[])[0]
    if (!existing) return err('Not found', 404)

    const hasAccess = user.stores?.some((s: any) => s.id === existing.storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    const updates: string[] = []
    const vals: any[] = []

    if (body.price !== undefined) { updates.push('price = ?'); vals.push(Number(body.price)) }
    if (body.stock !== undefined) { updates.push('stock = ?'); vals.push(Number(body.stock)) }
    if (body.sku !== undefined) { updates.push('sku = ?'); vals.push(body.sku ?? null) }
    if (body.active !== undefined) { updates.push('active = ?'); vals.push(body.active ? 1 : 0) }
    if (body.attributes !== undefined) {
      updates.push('attributes = ?')
      vals.push(JSON.stringify(body.attributes))
    }

    if (updates.length === 0) return err('No fields to update')

    updates.push('updatedAt = ?')
    vals.push(nowISO())
    vals.push(id)

    await exec(
      `UPDATE ProductVariant SET ${updates.join(', ')} WHERE id = ?`,
      vals,
    )

    return ok({ id, updated: true })
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Internal error' },
      { status: 500 },
    )
  }
}
