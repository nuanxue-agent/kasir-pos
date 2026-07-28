// GET /api/pricing-rules?storeId=
// POST /api/pricing-rules?storeId=
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

async function ensureTables() {
  await exec(`CREATE TABLE IF NOT EXISTS PricingRule (
    id         TEXT PRIMARY KEY,
    storeId    TEXT NOT NULL,
    name       TEXT NOT NULL,
    ruleType   TEXT NOT NULL,
    conditions TEXT NOT NULL,
    adjustment TEXT NOT NULL,
    value      REAL NOT NULL,
    priority   INTEGER NOT NULL DEFAULT 10,
    active     INTEGER NOT NULL DEFAULT 1,
    createdAt  TEXT NOT NULL,
    updatedAt  TEXT NOT NULL
  )`)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const sp = req.nextUrl.searchParams
  const storeId = sp.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureTables()

  const rows = await query(
    `SELECT * FROM PricingRule WHERE storeId = ? ORDER BY priority DESC, createdAt DESC`,
    [storeId],
  )

  const rules = (rows as any[]).map(row => ({
    ...row,
    active: Boolean(row.active),
    conditions: JSON.parse(row.conditions || '{}'),
  }))

  return NextResponse.json(rules)
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
  if (!b.ruleType) return err("Field 'ruleType' is required", 400, 'MISSING_FIELD')
  if (!['TIME_BASED', 'DEMAND_BASED', 'STOCK_BASED', 'SURGE'].includes(b.ruleType)) {
    return err('Invalid ruleType', 400, 'VALIDATION_ERROR')
  }
  if (!b.adjustment) return err("Field 'adjustment' is required", 400, 'MISSING_FIELD')
  if (!['PERCENTAGE', 'FIXED'].includes(b.adjustment)) {
    return err('Invalid adjustment', 400, 'VALIDATION_ERROR')
  }
  if (b.value === undefined || b.value === null) return err("Field 'value' is required", 400, 'MISSING_FIELD')

  const t = nowISO()
  const id = newId()
  await exec(
    `INSERT INTO PricingRule (id, storeId, name, ruleType, conditions, adjustment, value, priority, active, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      storeId,
      b.name,
      b.ruleType,
      JSON.stringify(b.conditions || {}),
      b.adjustment,
      b.value,
      b.priority ?? 10,
      b.active !== false ? 1 : 0,
      t,
      t,
    ],
  )
  return NextResponse.json({ id }, { status: 201 })
}
