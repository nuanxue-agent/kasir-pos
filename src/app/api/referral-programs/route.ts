// GET /api/referral-programs?storeId=
// POST /api/referral-programs
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, queryOne, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

async function ensureTables() {
  await exec(`
    CREATE TABLE IF NOT EXISTS ReferralProgram (
      id           TEXT PRIMARY KEY,
      storeId      TEXT NOT NULL,
      name         TEXT NOT NULL,
      rewardType   TEXT NOT NULL DEFAULT 'POINTS',
      rewardAmount REAL NOT NULL DEFAULT 0,
      active       INTEGER NOT NULL DEFAULT 1,
      createdAt    TEXT NOT NULL
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
    `SELECT * FROM ReferralProgram WHERE storeId=? ORDER BY createdAt DESC`,
    [storeId],
  )
  return NextResponse.json((rows as any[]).map(r => ({ ...r, active: Boolean(r.active) })))
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
  if (!b.rewardType) return err("Field 'rewardType' is required", 400, 'MISSING_FIELD')
  if (b.rewardAmount === undefined || b.rewardAmount === null || b.rewardAmount === '')
    return err("Field 'rewardAmount' is required", 400, 'MISSING_FIELD')

  const validTypes = ['DISCOUNT', 'POINTS', 'CASH']
  if (!validTypes.includes(b.rewardType)) {
    return err('rewardType must be DISCOUNT, POINTS, or CASH', 400, 'INVALID_VALUE')
  }
  const rewardAmount = Number(b.rewardAmount)
  if (isNaN(rewardAmount) || rewardAmount <= 0) {
    return err("'rewardAmount' must be a positive number", 400, 'INVALID_VALUE')
  }

  const id = newId()
  const t = nowISO()
  await exec(
    `INSERT INTO ReferralProgram (id,storeId,name,rewardType,rewardAmount,active,createdAt)
     VALUES (?,?,?,?,?,1,?)`,
    [id, storeId, b.name, b.rewardType, rewardAmount, t],
  )
  return NextResponse.json(
    { id, name: b.name, rewardType: b.rewardType, rewardAmount, active: true, createdAt: t },
    { status: 201 },
  )
}

export async function PATCH(req: NextRequest) {
  // PATCH /api/referral-programs/:id is handled by [id]/route.ts
  // This export is intentionally omitted here
  return NextResponse.json({ error: 'Not found' }, { status: 404 })
}
