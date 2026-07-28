// GET /api/loyalty-challenges?storeId=
// POST /api/loyalty-challenges
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

const VALID_TARGET_TYPES = ['PURCHASE_COUNT', 'SPEND_AMOUNT', 'VISIT_STREAK']

async function ensureTables() {
  await exec(`
    CREATE TABLE IF NOT EXISTS LoyaltyChallenge (
      id           TEXT PRIMARY KEY,
      storeId      TEXT NOT NULL,
      name         TEXT NOT NULL,
      description  TEXT NOT NULL DEFAULT '',
      targetType   TEXT NOT NULL DEFAULT 'PURCHASE_COUNT',
      targetValue  REAL NOT NULL DEFAULT 1,
      rewardPoints INTEGER NOT NULL DEFAULT 0,
      startAt      TEXT NOT NULL,
      endAt        TEXT NOT NULL,
      active       INTEGER NOT NULL DEFAULT 1,
      createdAt    TEXT NOT NULL
    )
  `)
  await exec(`
    CREATE TABLE IF NOT EXISTS CustomerChallenge (
      id          TEXT PRIMARY KEY,
      challengeId TEXT NOT NULL,
      customerId  TEXT NOT NULL,
      progress    REAL NOT NULL DEFAULT 0,
      completed   INTEGER NOT NULL DEFAULT 0,
      completedAt TEXT,
      createdAt   TEXT NOT NULL,
      UNIQUE(challengeId, customerId)
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
    `SELECT * FROM LoyaltyChallenge WHERE storeId=? ORDER BY startAt DESC`,
    [storeId],
  )
  return NextResponse.json(
    (rows as any[]).map((r) => ({ ...r, active: Boolean(r.active), completed: Boolean(r.completed) })),
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
  if (!b.targetType) return err("Field 'targetType' is required", 400, 'MISSING_FIELD')
  if (!VALID_TARGET_TYPES.includes(b.targetType))
    return err(`targetType must be one of: ${VALID_TARGET_TYPES.join(', ')}`, 400, 'INVALID_VALUE')
  if (!b.startAt) return err("Field 'startAt' is required", 400, 'MISSING_FIELD')
  if (!b.endAt) return err("Field 'endAt' is required", 400, 'MISSING_FIELD')

  const targetValue = Number(b.targetValue ?? 1)
  const rewardPoints = Number(b.rewardPoints ?? 0)
  if (isNaN(targetValue) || targetValue <= 0)
    return err("'targetValue' must be a positive number", 400, 'INVALID_VALUE')

  const id = newId()
  const t = nowISO()
  await exec(
    `INSERT INTO LoyaltyChallenge (id,storeId,name,description,targetType,targetValue,rewardPoints,startAt,endAt,active,createdAt)
     VALUES (?,?,?,?,?,?,?,?,?,1,?)`,
    [id, storeId, b.name, b.description ?? '', b.targetType, targetValue, rewardPoints, b.startAt, b.endAt, t],
  )
  return NextResponse.json(
    {
      id,
      storeId,
      name: b.name,
      description: b.description ?? '',
      targetType: b.targetType,
      targetValue,
      rewardPoints,
      startAt: b.startAt,
      endAt: b.endAt,
      active: true,
      createdAt: t,
    },
    { status: 201 },
  )
}
