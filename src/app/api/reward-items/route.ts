// GET /api/reward-items?storeId=
// POST /api/reward-items?storeId=
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function ensureRewardTables() {
  await exec(`
    CREATE TABLE IF NOT EXISTS RewardItem (
      id          TEXT PRIMARY KEY,
      storeId     TEXT NOT NULL,
      name        TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      pointsCost  INTEGER NOT NULL DEFAULT 0,
      category    TEXT NOT NULL DEFAULT 'DISCOUNT',
      stock       INTEGER NOT NULL DEFAULT 0,
      active      INTEGER NOT NULL DEFAULT 1,
      imageUrl    TEXT NOT NULL DEFAULT '',
      createdAt   TEXT NOT NULL,
      updatedAt   TEXT NOT NULL
    )
  `)
  await exec(`
    CREATE TABLE IF NOT EXISTS PointsRedemption (
      id           TEXT PRIMARY KEY,
      customerId   TEXT NOT NULL,
      storeId      TEXT NOT NULL,
      rewardItemId TEXT NOT NULL,
      pointsSpent  INTEGER NOT NULL DEFAULT 0,
      status       TEXT NOT NULL DEFAULT 'PENDING',
      createdAt    TEXT NOT NULL,
      updatedAt    TEXT NOT NULL
    )
  `)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureRewardTables()

  const rows = await query(
    `SELECT * FROM RewardItem WHERE storeId = ? ORDER BY category ASC, name ASC`,
    [storeId],
  )
  return NextResponse.json(
    (rows as any[]).map((r) => ({
      ...r,
      active: Boolean(r.active),
    })),
  )
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureRewardTables()

  const b = (await req.json()) as any
  if (!b.name) return err("Field 'name' is required", 400, 'MISSING_FIELD')
  if (!b.pointsCost || b.pointsCost < 0) return err('pointsCost must be >= 0', 400, 'INVALID_FIELD')

  const validCategories = ['DISCOUNT', 'FREE_PRODUCT', 'EXPERIENCE', 'VOUCHER']
  const category = b.category ?? 'DISCOUNT'
  if (!validCategories.includes(category)) return err('Invalid category', 400, 'INVALID_FIELD')

  const t = nowISO()
  const id = newId()
  await exec(
    `INSERT INTO RewardItem (id, storeId, name, description, pointsCost, category, stock, active, imageUrl, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      storeId,
      b.name,
      b.description ?? '',
      b.pointsCost,
      category,
      b.stock ?? 0,
      b.active !== false ? 1 : 0,
      b.imageUrl ?? '',
      t,
      t,
    ],
  )
  return NextResponse.json({ id }, { status: 201 })
}
