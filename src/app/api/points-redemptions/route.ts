import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, queryOne, newId, nowISO } from '@/lib/db'
import { ensureRewardTables } from '../reward-catalog/route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId    = req.nextUrl.searchParams.get('storeId')    ?? user.stores?.[0]?.id
  const customerId = req.nextUrl.searchParams.get('customerId')
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureRewardTables()

  const rows = customerId
    ? await query(
        `SELECT pr.*, rc.name as rewardName, rc.type as rewardType
         FROM PointsRedemption pr
         LEFT JOIN RewardCatalog rc ON rc.id = pr.rewardId
         WHERE pr.storeId = ? AND pr.customerId = ?
         ORDER BY pr.redeemedAt DESC`,
        [storeId, customerId],
      )
    : await query(
        `SELECT pr.*, rc.name as rewardName, rc.type as rewardType
         FROM PointsRedemption pr
         LEFT JOIN RewardCatalog rc ON rc.id = pr.rewardId
         WHERE pr.storeId = ?
         ORDER BY pr.redeemedAt DESC`,
        [storeId],
      )

  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureRewardTables()

  const b = (await req.json()) as any
  if (!b.customerId) return err('customerId required', 400, 'MISSING_FIELD')
  if (!b.rewardId)   return err('rewardId required',   400, 'MISSING_FIELD')

  // Load reward
  const reward = (await queryOne(`SELECT * FROM RewardCatalog WHERE id = ?`, [b.rewardId])) as any
  if (!reward) return err('Reward not found', 404, 'NOT_FOUND')
  if (!reward.active) return err('Reward is not active', 400, 'REWARD_INACTIVE')

  // Check expiry
  if (reward.expiresAt && reward.expiresAt < nowISO()) {
    return err('Reward has expired', 400, 'REWARD_EXPIRED')
  }

  // Check stock (-1 = unlimited)
  if (reward.stock !== -1 && reward.stock <= 0) {
    return err('Reward out of stock', 400, 'OUT_OF_STOCK')
  }

  // Load customer points — depends on LoyaltyPoints table from earlier sprints
  const pointsRow = (await queryOne(
    `SELECT balance FROM LoyaltyPoints WHERE storeId = ? AND customerId = ?`,
    [storeId, b.customerId],
  )) as any

  const balance = Number(pointsRow?.balance ?? 0)
  if (balance < reward.pointsCost) {
    return err('Insufficient points', 400, 'INSUFFICIENT_POINTS')
  }

  const id = newId()
  const t  = nowISO()

  // Deduct points
  await exec(
    `UPDATE LoyaltyPoints SET balance = balance - ?, updatedAt = ? WHERE storeId = ? AND customerId = ?`,
    [reward.pointsCost, t, storeId, b.customerId],
  )

  // Decrement stock if finite
  if (reward.stock !== -1) {
    await exec(`UPDATE RewardCatalog SET stock = stock - 1, updatedAt = ? WHERE id = ?`, [t, reward.id])
  }

  await exec(
    `INSERT INTO PointsRedemption (id, storeId, customerId, rewardId, pointsSpent, status, redeemedAt, fulfilledAt, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, 'PENDING', ?, NULL, ?, ?)`,
    [id, storeId, b.customerId, b.rewardId, reward.pointsCost, t, t, t],
  )

  return NextResponse.json({ id, pointsSpent: reward.pointsCost }, { status: 201 })
}
