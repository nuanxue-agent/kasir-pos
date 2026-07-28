import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { exec, nowISO } from '@/lib/db'
import { ensureCouponTables } from '../route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')

  const { id } = await params
  await ensureCouponTables()

  const b = (await req.json()) as any

  const sets: string[] = []
  const vals: any[] = []

  if (b.code !== undefined)             { sets.push('code = ?');             vals.push(String(b.code).toUpperCase().trim()) }
  if (b.name !== undefined)             { sets.push('name = ?');             vals.push(b.name) }
  if (b.discountType !== undefined)     { sets.push('discountType = ?');     vals.push(b.discountType) }
  if (b.discountValue !== undefined)    { sets.push('discountValue = ?');    vals.push(b.discountValue) }
  if (b.minOrderAmount !== undefined)   { sets.push('minOrderAmount = ?');   vals.push(b.minOrderAmount) }
  if (b.maxDiscount !== undefined)      { sets.push('maxDiscount = ?');      vals.push(b.maxDiscount) }
  if (b.usageLimit !== undefined)       { sets.push('usageLimit = ?');       vals.push(b.usageLimit) }
  if (b.perCustomerLimit !== undefined) { sets.push('perCustomerLimit = ?'); vals.push(b.perCustomerLimit) }
  if (b.segments !== undefined)         { sets.push('segments = ?');         vals.push(JSON.stringify(b.segments)) }
  if (b.productIds !== undefined)       { sets.push('productIds = ?');       vals.push(JSON.stringify(b.productIds)) }
  if (b.categoryIds !== undefined)      { sets.push('categoryIds = ?');      vals.push(JSON.stringify(b.categoryIds)) }
  if (b.startDate !== undefined)        { sets.push('startDate = ?');        vals.push(b.startDate) }
  if (b.endDate !== undefined)          { sets.push('endDate = ?');          vals.push(b.endDate) }
  if (b.active !== undefined)           { sets.push('active = ?');           vals.push(b.active ? 1 : 0) }

  if (sets.length === 0) return err('No fields to update')

  sets.push('updatedAt = ?')
  vals.push(nowISO())
  vals.push(id)

  await exec(`UPDATE Coupon SET ${sets.join(', ')} WHERE id = ?`, vals)

  return NextResponse.json({ ok: true })
}
