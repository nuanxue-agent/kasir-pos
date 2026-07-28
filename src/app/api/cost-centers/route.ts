// GET/POST /api/cost-centers
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

export async function ensureCostCenterTables() {
  await exec(`CREATE TABLE IF NOT EXISTS CostCenter (
    id         TEXT PRIMARY KEY,
    storeId    TEXT NOT NULL,
    name       TEXT NOT NULL,
    type       TEXT NOT NULL DEFAULT 'OVERHEAD',
    budget     REAL NOT NULL DEFAULT 0,
    actualCost REAL NOT NULL DEFAULT 0,
    period     TEXT NOT NULL,
    createdAt  TEXT NOT NULL,
    updatedAt  TEXT NOT NULL
  )`)
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const sp = req.nextUrl.searchParams
    const storeId = sp.get('storeId') ?? user.stores?.[0]?.id
    if (!storeId) return err('storeId required')

    const hasAccess = user.stores?.some((s: { id: string }) => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    await ensureCostCenterTables()

    const period = sp.get('period')
    const type = sp.get('type')

    let sql = `SELECT * FROM CostCenter WHERE storeId = ?`
    const params: any[] = [storeId]

    if (period) { sql += ` AND period = ?`; params.push(period) }
    if (type)   { sql += ` AND type = ?`;   params.push(type) }
    sql += ` ORDER BY type ASC, name ASC`

    const rows = await query(sql, params)
    return ok(rows)
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
    if (!storeId) return err('storeId required')

    const hasAccess = user.stores?.some((s: { id: string }) => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    await ensureCostCenterTables()

    const b = (await req.json()) as any
    if (!b.name)   return err("Field 'name' is required")
    if (!b.period) return err("Field 'period' is required")

    const VALID_TYPES = ['PRODUCTION', 'OVERHEAD', 'ADMIN', 'SALES']
    const type = b.type ?? 'OVERHEAD'
    if (!VALID_TYPES.includes(type)) return err(`type must be one of: ${VALID_TYPES.join(', ')}`)

    const t = nowISO()
    const id = newId()
    await exec(
      `INSERT INTO CostCenter (id, storeId, name, type, budget, actualCost, period, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, storeId, b.name, type,
       Number(b.budget ?? 0), Number(b.actualCost ?? 0),
       b.period, t, t],
    )
    return ok({ id }, 201)
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500)
  }
}
