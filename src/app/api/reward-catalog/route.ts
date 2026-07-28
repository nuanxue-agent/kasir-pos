import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function ensureRewardTables() {
  await exec(`CREATE TABLE IF NOT EXISTS RewardCatalog (
    id          TEXT PRIMARY KEY,
    storeId     TEXT NOT NULL,
    name        TEXT NOT NULL,
    description TEXT,
    type        TEXT NOT NULL DEFAULT 'DISCOUNT',
    pointsCost  INTEGER NOT NULL DEFAULT 0,
    value       REAL NOT NULL DEFAULT 0,
    stock       INTEGER NOT NULL DEFAULT -1,
    active      INTEGER NOT NULL DEFAULT 1,
    expiresAt   TEXT,
    createdAt   TEXT NOT NULL,
    updatedAt   TEXT NOT NULL
  )`)

  await exec(`CREATE TABLE IF NOT EXISTS PointsRedemption (
    id          TEXT PRIMARY KEY,
    storeId     TEXT NOT NULL,
    customerId  TEXT NOT NULL,
    rewardId    TEXT NOT NULL,
    pointsSpent INTEGER NOT NULL DEFAULT 0,
    status      TEXT NOT NULL DEFAULT 'PENDING',
    redeemedAt  TEXT NOT NULL,
    fulfilledAt TEXT,
    createdAt   TEXT NOT NULL,
    updatedAt   TEXT NOT NULL
  )`)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureRewardTables()

  const activeOnly = req.nextUrl.searchParams.get('active')
  const rows = activeOnly === '1'
    ? await query(
        `SELECT * FROM RewardCatalog WHERE storeId = ? AND active = 1 ORDER BY pointsCost ASC`,
        [storeId],
      )
    : await query(
        `SELECT * FROM RewardCatalog WHERE storeId = ? ORDER BY createdAt DESC`,
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
  if (!b.name?.trim()) return err('name required', 400, 'MISSING_FIELD')

  const validTypes = ['DISCOUNT', 'FREE_ITEM', 'VOUCHER', 'EXPERIENCE']
  const type = b.type ?? 'DISCOUNT'
  if (!validTypes.includes(type)) return err('invalid type', 400, 'INVALID_TYPE')

  const pointsCost = Number(b.pointsCost ?? 0)
  if (pointsCost <= 0) return err('pointsCost must be positive', 400, 'MISSING_FIELD')

  const value = Number(b.value ?? 0)
  const stock = b.stock !== undefined ? Number(b.stock) : -1
  const id = newId()
  const t = nowISO()

  await exec(
    `INSERT INTO RewardCatalog (id, storeId, name, description, type, pointsCost, value, stock, active, expiresAt, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    [id, storeId, b.name.trim(), b.description ?? null, type, pointsCost, value, stock, b.expiresAt ?? null, t, t],
  )

  return NextResponse.json({ id }, { status: 201 })
}
