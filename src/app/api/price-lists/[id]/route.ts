// PATCH /api/price-lists/[id]
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { exec, queryOne, nowISO } from '@/lib/db'
import { ensurePriceListTables } from '../route'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

// PATCH /api/price-lists/[id]
// Body: { name?, description?, type?, discountType?, discountValue?, active?, validFrom?, validTo? }
export async function PATCH(
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
    const t = nowISO()

    const sets: string[] = ['updatedAt = ?']
    const vals: unknown[] = [t]

    if (b.name !== undefined) { sets.push('name = ?'); vals.push(b.name.trim()) }
    if (b.description !== undefined) { sets.push('description = ?'); vals.push(b.description) }
    if (b.type !== undefined) {
      if (!['RETAIL', 'WHOLESALE', 'VIP', 'CUSTOM'].includes(b.type)) return err('Invalid type')
      sets.push('type = ?'); vals.push(b.type)
    }
    if (b.discountType !== undefined) {
      if (!['FIXED', 'PERCENTAGE'].includes(b.discountType)) return err('Invalid discountType')
      sets.push('discountType = ?'); vals.push(b.discountType)
    }
    if (b.discountValue !== undefined) { sets.push('discountValue = ?'); vals.push(b.discountValue) }
    if (b.active !== undefined) { sets.push('active = ?'); vals.push(b.active ? 1 : 0) }
    if (b.validFrom !== undefined) { sets.push('validFrom = ?'); vals.push(b.validFrom) }
    if (b.validTo !== undefined) { sets.push('validTo = ?'); vals.push(b.validTo) }

    vals.push(id)
    await exec(`UPDATE PriceList SET ${sets.join(', ')} WHERE id = ?`, vals)

    return ok({ id })
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
