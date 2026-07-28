import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

const VALID_METRICS = ['REVENUE', 'TRANSACTIONS', 'NEW_CUSTOMERS'] as const
type Metric = typeof VALID_METRICS[number]

async function ensureTable(): Promise<void> {
  await exec(`
    CREATE TABLE IF NOT EXISTS StoreTarget (
      id           TEXT PRIMARY KEY,
      storeId      TEXT NOT NULL,
      metric       TEXT NOT NULL CHECK(metric IN ('REVENUE','TRANSACTIONS','NEW_CUSTOMERS')),
      targetValue  REAL NOT NULL,
      period       TEXT NOT NULL,
      actualValue  REAL NOT NULL DEFAULT 0,
      createdAt    TEXT NOT NULL,
      updatedAt    TEXT NOT NULL
    )
  `)
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const sp      = req.nextUrl.searchParams
    const storeId = sp.get('storeId') ?? user.stores?.[0]?.id
    if (!storeId) return err('storeId required')

    const hasAccess = (user.stores ?? []).some((s: { id: string }) => s.id === storeId)
    if (!hasAccess) return err('Forbidden', 403)

    await ensureTable()

    const period = sp.get('period')
    let sql = `SELECT * FROM StoreTarget WHERE storeId = ?`
    const params: any[] = [storeId]
    if (period) { sql += ` AND period = ?`; params.push(period) }
    sql += ` ORDER BY period DESC, metric ASC`

    const rows = await query(sql, params) as any[]
    return ok({ targets: rows, total: rows.length })
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const body = await req.json() as any
    const { storeId, metric, targetValue, period, actualValue } = body

    if (!storeId)  return err('storeId required')
    if (!metric || !VALID_METRICS.includes(metric as Metric)) return err('Invalid metric')
    if (typeof targetValue !== 'number' || targetValue < 0) return err('targetValue must be a non-negative number')
    if (!period)   return err('period required')

    const hasAccess = (user.stores ?? []).some((s: { id: string }) => s.id === storeId)
    if (!hasAccess) return err('Forbidden', 403)

    await ensureTable()

    const id  = newId()
    const now = nowISO()
    const actual = typeof actualValue === 'number' ? actualValue : 0

    await exec(
      `INSERT INTO StoreTarget (id, storeId, metric, targetValue, period, actualValue, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, storeId, metric, targetValue, period, actual, now, now],
    )

    const created = await query(`SELECT * FROM StoreTarget WHERE id = ?`, [id]) as any[]
    return ok(created[0], 201)
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500)
  }
}
