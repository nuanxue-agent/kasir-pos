// PATCH /api/loyalty-tiers/:id
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { queryOne, exec } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

function buildUpdate(cols: Record<string, any>): { setClauses: string; values: any[] } {
  const setClauses = Object.keys(cols)
    .map((k) => `${k} = ?`)
    .join(', ')
  const values = Object.values(cols)
  return { setClauses, values }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  const { id: tierId } = await params

  const existing = await queryOne(`SELECT * FROM LoyaltyTier WHERE id=? AND storeId=?`, [
    tierId,
    storeId,
  ])
  if (!existing) return err('Tier not found', 404, 'NOT_FOUND')

  const b = (await req.json()) as any
  const updates: Record<string, any> = {}
  if (b.active !== undefined) updates.active = b.active ? 1 : 0
  if (b.name !== undefined) updates.name = b.name
  if (b.minPoints !== undefined) updates.minPoints = Number(b.minPoints)
  if (b.maxPoints !== undefined) updates.maxPoints = b.maxPoints != null ? Number(b.maxPoints) : null
  if (b.discountPct !== undefined) updates.discountPct = Number(b.discountPct)
  if (b.bonusMultiplier !== undefined) updates.bonusMultiplier = Number(b.bonusMultiplier)
  if (b.badgeColor !== undefined) updates.badgeColor = b.badgeColor

  if (Object.keys(updates).length === 0) return err('Nothing to update', 400, 'VALIDATION_ERROR')

  const { setClauses, values } = buildUpdate(updates)
  await exec(`UPDATE LoyaltyTier SET ${setClauses} WHERE id=? AND storeId=?`, [
    ...values,
    tierId,
    storeId,
  ])
  return NextResponse.json({ updated: true })
}
