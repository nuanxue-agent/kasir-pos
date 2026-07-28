// GET /api/pricing-rules?storeId=
// POST /api/pricing-rules
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

async function ensureTables() {
  await exec(`CREATE TABLE IF NOT EXISTS PricingRule (
    id        TEXT PRIMARY KEY,
    storeId   TEXT NOT NULL,
    name      TEXT NOT NULL,
    type      TEXT NOT NULL DEFAULT 'TIME_BASED',
    condition TEXT NOT NULL DEFAULT '{}',
    action    TEXT NOT NULL DEFAULT '{}',
    priority  INTEGER NOT NULL DEFAULT 10,
    active    INTEGER NOT NULL DEFAULT 1,
    validFrom TEXT,
    validTo   TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS PriceAdjustmentLog (
    id        TEXT PRIMARY KEY,
    storeId   TEXT NOT NULL,
    productId TEXT NOT NULL,
    ruleId    TEXT NOT NULL,
    oldPrice  REAL NOT NULL,
    newPrice  REAL NOT NULL,
    appliedAt TEXT NOT NULL,
    reason    TEXT NOT NULL DEFAULT ''
  )`)
}

function parseRule(r: any) {
  return {
    ...r,
    active: Boolean(r.active),
    condition: (() => { try { return JSON.parse(r.condition || '{}') } catch { return {} } })(),
    action: (() => { try { return JSON.parse(r.action || '{}') } catch { return {} } })(),
  }
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)
  const user = session.user as any

  const sp = req.nextUrl.searchParams
  const storeId = sp.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required')

  await ensureTables()

  const rows = await query(
    `SELECT * FROM PricingRule WHERE storeId = ? ORDER BY priority DESC, createdAt DESC`,
    [storeId],
  )

  return NextResponse.json((rows as any[]).map(parseRule))
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)
  const user = session.user as any

  const body = await req.json() as any
  const storeId = body.storeId ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required')
  if (!body.name) return err('name required')
  if (!body.type) return err('type required')

  await ensureTables()

  const id = newId()
  const now = nowISO()

  await exec(
    `INSERT INTO PricingRule (id, storeId, name, type, condition, action, priority, active, validFrom, validTo, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      storeId,
      body.name,
      body.type,
      JSON.stringify(body.condition ?? {}),
      JSON.stringify(body.action ?? {}),
      body.priority ?? 10,
      body.active !== false ? 1 : 0,
      body.validFrom ?? null,
      body.validTo ?? null,
      now,
      now,
    ],
  )

  const row = await query(`SELECT * FROM PricingRule WHERE id = ?`, [id])
  return NextResponse.json(parseRule((row as any[])[0]), { status: 201 })
}
