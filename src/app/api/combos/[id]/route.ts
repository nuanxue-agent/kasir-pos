// PATCH /api/combos/[id]?storeId=
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { exec, queryOne, nowISO } from '@/lib/db'
import { ensureCombTables } from '../route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const { id } = await params
  const sp = req.nextUrl.searchParams
  const storeId = sp.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureCombTables()

  const existing = await queryOne(`SELECT id FROM Combo WHERE id = ? AND storeId = ?`, [id, storeId]) as any
  if (!existing) return err('Combo not found', 404, 'NOT_FOUND')

  const b = (await req.json()) as any

  const sets: string[] = []
  const vals: any[] = []

  if (b.name !== undefined)          { sets.push('name = ?');          vals.push(b.name.trim()) }
  if (b.description !== undefined)   { sets.push('description = ?');   vals.push(b.description) }
  if (b.basePrice !== undefined)     { sets.push('basePrice = ?');      vals.push(Number(b.basePrice)) }
  if (b.discountType !== undefined) {
    if (!['PERCENTAGE', 'FIXED'].includes(b.discountType)) return err('Invalid discountType', 400, 'INVALID_FIELD')
    sets.push('discountType = ?')
    vals.push(b.discountType)
  }
  if (b.discountValue !== undefined) { sets.push('discountValue = ?'); vals.push(Number(b.discountValue)) }
  if (b.active !== undefined)        { sets.push('active = ?');        vals.push(b.active ? 1 : 0) }
  if (b.startDate !== undefined)     { sets.push('startDate = ?');     vals.push(b.startDate) }
  if (b.endDate !== undefined)       { sets.push('endDate = ?');       vals.push(b.endDate) }

  if (sets.length === 0) return err('No fields to update', 400, 'NO_FIELDS')

  sets.push('updatedAt = ?')
  vals.push(nowISO())
  vals.push(id)

  await exec(`UPDATE Combo SET ${sets.join(', ')} WHERE id = ?`, vals)
  return NextResponse.json({ ok: true })
}
