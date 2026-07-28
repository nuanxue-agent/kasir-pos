// GET /api/points-redemptions?storeId=&customerId=
// POST /api/points-redemptions?storeId=
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import { ensureRewardTables } from '../reward-items/route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  const customerId = req.nextUrl.searchParams.get('customerId')

  await ensureRewardTables()

  let sql = `
    SELECT pr.*, ri.name as rewardName, ri.category as rewardCategory, ri.pointsCost
    FROM PointsRedemption pr
    LEFT JOIN RewardItem ri ON pr.rewardItemId = ri.id
    WHERE pr.storeId = ?
  `
  const vals: any[] = [storeId]
  if (customerId) { sql += ' AND pr.customerId = ?'; vals.push(customerId) }
  sql += ' ORDER BY pr.createdAt DESC'

  const rows = await query(sql, vals)
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
  if (!b.customerId) return err("Field 'customerId' is required", 400, 'MISSING_FIELD')
  if (!b.rewardItemId) return err("Field 'rewardItemId' is required", 400, 'MISSING_FIELD')

  // Fetch reward item
  const rewardRows = await query(
    `SELECT * FROM RewardItem WHERE id = ? AND storeId = ?`,
    [b.rewardItemId, storeId],
  )
  if (rewardRows.length === 0) return err('Reward item not found', 404, 'NOT_FOUND')
  const reward = rewardRows[0] as any

  if (!Boolean(reward.active)) return err('Reward item is not active', 400, 'INACTIVE')
  if (reward.stock !== null && reward.stock <= 0) return err('Reward item is out of stock', 400, 'OUT_OF_STOCK')

  // Fetch customer points balance
  const customerRows = await query(
    `SELECT loyaltyPoints FROM Customer WHERE id = ? AND storeId = ?`,
    [b.customerId, storeId],
  )
  if (customerRows.length === 0) return err('Customer not found', 404, 'NOT_FOUND')
  const customer = customerRows[0] as any
  const points = customer.loyaltyPoints ?? 0

  if (points < reward.pointsCost) {
    return err(
      `Insufficient points. Required: ${reward.pointsCost}, Available: ${points}`,
      400,
      'INSUFFICIENT_POINTS',
    )
  }

  const t = nowISO()
  const id = newId()

  // Deduct points from customer
  await exec(
    `UPDATE Customer SET loyaltyPoints = loyaltyPoints - ? WHERE id = ? AND storeId = ?`,
    [reward.pointsCost, b.customerId, storeId],
  )

  // Decrement stock
  await exec(
    `UPDATE RewardItem SET stock = stock - 1, updatedAt = ? WHERE id = ?`,
    [t, b.rewardItemId],
  )

  // Create redemption record
  await exec(
    `INSERT INTO PointsRedemption (id, customerId, storeId, rewardItemId, pointsSpent, status, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?)`,
    [id, b.customerId, storeId, b.rewardItemId, reward.pointsCost, t, t],
  )

  return NextResponse.json({ id, pointsSpent: reward.pointsCost }, { status: 201 })
}
