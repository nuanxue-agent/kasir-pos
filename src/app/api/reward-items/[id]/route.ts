// PATCH /api/reward-items/[id]
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { exec, nowISO } from '@/lib/db'
import { ensureRewardTables } from '../route'

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
  await ensureRewardTables()

  const b = (await req.json()) as any
  const sets: string[] = []
  const vals: any[] = []

  if (b.name !== undefined) { sets.push('name = ?'); vals.push(b.name) }
  if (b.description !== undefined) { sets.push('description = ?'); vals.push(b.description) }
  if (b.pointsCost !== undefined) { sets.push('pointsCost = ?'); vals.push(b.pointsCost) }
  if (b.category !== undefined) { sets.push('category = ?'); vals.push(b.category) }
  if (b.stock !== undefined) { sets.push('stock = ?'); vals.push(b.stock) }
  if (b.active !== undefined) { sets.push('active = ?'); vals.push(b.active ? 1 : 0) }
  if (b.imageUrl !== undefined) { sets.push('imageUrl = ?'); vals.push(b.imageUrl) }

  if (sets.length === 0) return err('No fields to update', 400, 'NO_FIELDS')
  sets.push('updatedAt = ?'); vals.push(nowISO()); vals.push(id)

  await exec(`UPDATE RewardItem SET ${sets.join(', ')} WHERE id = ?`, vals)
  return NextResponse.json({ ok: true })
}
