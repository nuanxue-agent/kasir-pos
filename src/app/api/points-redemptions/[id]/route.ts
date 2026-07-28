// PATCH /api/points-redemptions/[id] — fulfill or cancel
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, nowISO } from '@/lib/db'
import { ensureRewardTables } from '../../reward-items/route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  PENDING:   ['FULFILLED', 'CANCELLED'],
  FULFILLED: [],
  CANCELLED: [],
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')

  const { id } = await params
  await ensureRewardTables()

  const rows = await query(`SELECT * FROM PointsRedemption WHERE id = ?`, [id])
  if (rows.length === 0) return err('Redemption not found', 404, 'NOT_FOUND')
  const redemption = rows[0] as any

  const b = (await req.json()) as any
  const newStatus: string = b.status

  if (!newStatus) return err("Field 'status' is required", 400, 'MISSING_FIELD')

  const allowed = VALID_TRANSITIONS[redemption.status] ?? []
  if (!allowed.includes(newStatus)) {
    return err(
      `Cannot transition from ${redemption.status} to ${newStatus}`,
      400,
      'INVALID_TRANSITION',
    )
  }

  const t = nowISO()

  // If cancelling, restore points and stock
  if (newStatus === 'CANCELLED') {
    await exec(
      `UPDATE Customer SET loyaltyPoints = loyaltyPoints + ? WHERE id = ? AND storeId = ?`,
      [redemption.pointsSpent, redemption.customerId, redemption.storeId],
    )
    await exec(
      `UPDATE RewardItem SET stock = stock + 1, updatedAt = ? WHERE id = ?`,
      [t, redemption.rewardItemId],
    )
  }

  await exec(
    `UPDATE PointsRedemption SET status = ?, updatedAt = ? WHERE id = ?`,
    [newStatus, t, id],
  )

  return NextResponse.json({ ok: true, status: newStatus })
}
