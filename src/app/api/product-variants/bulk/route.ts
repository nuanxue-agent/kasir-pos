// POST /api/product-variants/bulk
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { exec, nowISO } from '@/lib/db'
import { ensureVariantTables } from '../route'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

// POST /api/product-variants/bulk
// Body: { storeId, updates: [{ id, price?, stock?, active? }] }
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    await ensureVariantTables()

    const b = (await req.json()) as any
    if (!b.storeId) return err('storeId required')
    if (!Array.isArray(b.updates) || b.updates.length === 0) return err('updates array required')

    const hasAccess = user.stores?.some((s: { id: string }) => s.id === b.storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    // Validate all updates first
    for (const u of b.updates) {
      if (!u.id) return err('Each update must have an id')
      if (u.price !== undefined && u.price < 0) return err(`price cannot be negative (id: ${u.id})`)
      if (u.stock !== undefined && u.stock < 0) return err(`stock cannot be negative (id: ${u.id})`)
    }

    const t = nowISO()
    let count = 0

    for (const u of b.updates) {
      const setClauses: string[] = ['updatedAt = ?']
      const values: unknown[] = [t]

      if (u.price !== undefined) { setClauses.push('price = ?'); values.push(u.price) }
      if (u.stock !== undefined) { setClauses.push('stock = ?'); values.push(u.stock) }
      if (u.active !== undefined) { setClauses.push('active = ?'); values.push(u.active ? 1 : 0) }

      values.push(u.id, b.storeId)

      await exec(
        `UPDATE ProductVariant SET ${setClauses.join(', ')} WHERE id = ? AND storeId = ?`,
        values
      )
      count++
    }

    return ok({ updated: count })
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
