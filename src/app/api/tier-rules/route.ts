// GET /api/tier-rules?storeId=
// POST /api/tier-rules?storeId=
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function ensureTierTables() {
  await exec(`
    CREATE TABLE IF NOT EXISTS TierRule (
      id         TEXT PRIMARY KEY,
      storeId    TEXT NOT NULL,
      tierName   TEXT NOT NULL,
      minSpend   REAL NOT NULL DEFAULT 0,
      minPoints  REAL NOT NULL DEFAULT 0,
      minVisits  INTEGER NOT NULL DEFAULT 0,
      periodDays INTEGER NOT NULL DEFAULT 0,
      benefits   TEXT NOT NULL DEFAULT '{}',
      color      TEXT NOT NULL DEFAULT '#6366f1',
      icon       TEXT NOT NULL DEFAULT 'star',
      active     INTEGER NOT NULL DEFAULT 1,
      createdAt  TEXT NOT NULL,
      updatedAt  TEXT NOT NULL
    )
  `)
  await exec(`
    CREATE TABLE IF NOT EXISTS TierHistory (
      id         TEXT PRIMARY KEY,
      customerId TEXT NOT NULL,
      storeId    TEXT NOT NULL,
      fromTier   TEXT,
      toTier     TEXT,
      reason     TEXT NOT NULL DEFAULT '',
      changedAt  TEXT NOT NULL
    )
  `)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureTierTables()

  const rows = await query(
    `SELECT * FROM TierRule WHERE storeId = ? ORDER BY minSpend ASC`,
    [storeId],
  )

  const rules = (rows as any[]).map(r => ({
    ...r,
    active: Boolean(r.active),
    benefits: JSON.parse(r.benefits || '{}'),
  }))

  return NextResponse.json(rules)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureTierTables()

  const b = (await req.json()) as any
  if (!b.tierName?.trim()) return err("Field 'tierName' is required", 400, 'MISSING_FIELD')

  const t = nowISO()
  const id = newId()
  await exec(
    `INSERT INTO TierRule (id, storeId, tierName, minSpend, minPoints, minVisits, periodDays, benefits, color, icon, active, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    [
      id,
      storeId,
      b.tierName.trim(),
      b.minSpend ?? 0,
      b.minPoints ?? 0,
      b.minVisits ?? 0,
      b.periodDays ?? 0,
      JSON.stringify(b.benefits ?? {}),
      b.color ?? '#6366f1',
      b.icon ?? 'star',
      t,
      t,
    ],
  )

  return NextResponse.json({ id }, { status: 201 })
}
