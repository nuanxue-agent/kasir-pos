import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { exec, queryOne, nowISO } from '@/lib/db'
import { ensureRewardTables } from '../route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')

  await ensureRewardTables()

  const reward = (await queryOne(`SELECT * FROM RewardCatalog WHERE id = ?`, [id])) as any
  if (!reward) return err('Reward not found', 404, 'NOT_FOUND')

  const b = (await req.json()) as any
  const t = nowISO()

  const name        = b.name        !== undefined ? b.name.trim()       : reward.name
  const description = b.description !== undefined ? b.description       : reward.description
  const type        = b.type        !== undefined ? b.type              : reward.type
  const pointsCost  = b.pointsCost  !== undefined ? Number(b.pointsCost): reward.pointsCost
  const value       = b.value       !== undefined ? Number(b.value)     : reward.value
  const stock       = b.stock       !== undefined ? Number(b.stock)     : reward.stock
  const active      = b.active      !== undefined ? (b.active ? 1 : 0)  : reward.active
  const expiresAt   = b.expiresAt   !== undefined ? b.expiresAt         : reward.expiresAt

  if (!name) return err('name required', 400, 'MISSING_FIELD')
  if (pointsCost <= 0) return err('pointsCost must be positive', 400, 'MISSING_FIELD')

  await exec(
    `UPDATE RewardCatalog
     SET name = ?, description = ?, type = ?, pointsCost = ?, value = ?, stock = ?, active = ?, expiresAt = ?, updatedAt = ?
     WHERE id = ?`,
    [name, description, type, pointsCost, value, stock, active, expiresAt, t, id],
  )

  return NextResponse.json({ ok: true })
}
