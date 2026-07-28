// GET /api/loyalty-tiers?storeId=
// POST /api/loyalty-tiers
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

async function ensureTables() {
  await exec(`
    CREATE TABLE IF NOT EXISTS LoyaltyTier (
      id              TEXT PRIMARY KEY,
      storeId         TEXT NOT NULL,
      name            TEXT NOT NULL,
      minPoints       INTEGER NOT NULL DEFAULT 0,
      maxPoints       INTEGER,
      discountPct     REAL NOT NULL DEFAULT 0,
      bonusMultiplier REAL NOT NULL DEFAULT 1,
      badgeColor      TEXT NOT NULL DEFAULT '#CD7F32',
      active          INTEGER NOT NULL DEFAULT 1,
      createdAt       TEXT NOT NULL
    )
  `)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureTables()

  const rows = await query(
    `SELECT * FROM LoyaltyTier WHERE storeId=? ORDER BY minPoints ASC`,
    [storeId],
  )
  return NextResponse.json(
    (rows as any[]).map((r) => ({
      ...r,
      active: Boolean(r.active),
      maxPoints: r.maxPoints ?? null,
    })),
  )
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureTables()

  const b = (await req.json()) as any
  if (!b.name) return err("Field 'name' is required", 400, 'MISSING_FIELD')
  if (b.minPoints === undefined || b.minPoints === null)
    return err("Field 'minPoints' is required", 400, 'MISSING_FIELD')

  const minPoints = Number(b.minPoints)
  const maxPoints = b.maxPoints != null ? Number(b.maxPoints) : null
  const discountPct = Number(b.discountPct ?? 0)
  const bonusMultiplier = Number(b.bonusMultiplier ?? 1)
  const badgeColor = b.badgeColor ?? '#CD7F32'

  if (isNaN(minPoints) || minPoints < 0)
    return err("'minPoints' must be a non-negative number", 400, 'INVALID_VALUE')

  const id = newId()
  const t = nowISO()
  await exec(
    `INSERT INTO LoyaltyTier (id,storeId,name,minPoints,maxPoints,discountPct,bonusMultiplier,badgeColor,active,createdAt)
     VALUES (?,?,?,?,?,?,?,?,1,?)`,
    [id, storeId, b.name, minPoints, maxPoints, discountPct, bonusMultiplier, badgeColor, t],
  )
  return NextResponse.json(
    {
      id,
      storeId,
      name: b.name,
      minPoints,
      maxPoints,
      discountPct,
      bonusMultiplier,
      badgeColor,
      active: true,
      createdAt: t,
    },
    { status: 201 },
  )
}
