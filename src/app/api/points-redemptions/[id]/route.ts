import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { exec, queryOne, nowISO } from '@/lib/db'
import { ensureRewardTables } from '../../reward-catalog/route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  PENDING:   ['FULFILLED', 'CANCELLED'],
  FULFILLED: [],
  EXPIRED:   [],
  CANCELLED: [],
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')

  await ensureRewardTables()

  const redemption = (await queryOne(`SELECT * FROM PointsRedemption WHERE id = ?`, [id])) as any
  if (!redemption) return err('Redemption not found', 404, 'NOT_FOUND')

  const b = (await req.json()) as any
  const newStatus: string = b.status
  if (!newStatus) return err('status required', 400, 'MISSING_FIELD')

  const allowed = VALID_TRANSITIONS[redemption.status] ?? []
  if (!allowed.includes(newStatus)) {
    return err(
      `Cannot transition from ${redemption.status} to ${newStatus}`,
      400,
      'INVALID_TRANSITION',
    )
  }

  const t = nowISO()
  const fulfilledAt = newStatus === 'FULFILLED' ? t : redemption.fulfilledAt

  await exec(
    `UPDATE PointsRedemption SET status = ?, fulfilledAt = ?, updatedAt = ? WHERE id = ?`,
    [newStatus, fulfilledAt, t, id],
  )

  // If cancelled, refund points
  if (newStatus === 'CANCELLED') {
    await exec(
      `UPDATE LoyaltyPoints SET balance = balance + ?, updatedAt = ? WHERE storeId = ? AND customerId = ?`,
      [redemption.pointsSpent, t, redemption.storeId, redemption.customerId],
    )
    // Restore stock if finite
    const reward = (await queryOne(`SELECT stock FROM RewardCatalog WHERE id = ?`, [redemption.rewardId])) as any
    if (reward && reward.stock !== -1) {
      await exec(`UPDATE RewardCatalog SET stock = stock + 1, updatedAt = ? WHERE id = ?`, [t, redemption.rewardId])
    }
  }

  return NextResponse.json({ ok: true, status: newStatus })
}
