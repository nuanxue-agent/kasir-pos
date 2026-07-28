// API route: GET /api/kpi-goals  POST /api/kpi-goals
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function ok(data: unknown) {
  return NextResponse.json(data)
}
function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

const VALID_METRICS = ['REVENUE', 'ORDERS', 'CUSTOMERS', 'AVG_ORDER', 'REPEAT_RATE'] as const
const VALID_PERIODS = ['MONTHLY', 'QUARTERLY', 'YEARLY'] as const

async function ensureTable() {
  await exec(`
    CREATE TABLE IF NOT EXISTS KpiGoal (
      id         TEXT PRIMARY KEY,
      storeId    TEXT NOT NULL,
      metric     TEXT NOT NULL,
      period     TEXT NOT NULL,
      target     REAL NOT NULL,
      actual     REAL NOT NULL DEFAULT 0,
      year       INTEGER NOT NULL,
      month      INTEGER,
      quarter    INTEGER,
      createdAt  TEXT NOT NULL
    )
  `)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)
  const user = session.user as any
  const storeIds: string[] = user.stores?.map((s: any) => s.id) ?? []

  const { searchParams } = new URL(req.url)
  const storeId = searchParams.get('storeId') ?? ''
  const period = searchParams.get('period') ?? ''

  if (!storeId || !storeIds.includes(storeId)) return err('Store not found', 403)

  try {
    await ensureTable()

    let sql = `SELECT * FROM KpiGoal WHERE storeId = ?`
    const params: any[] = [storeId]

    if (period && VALID_PERIODS.includes(period as any)) {
      sql += ` AND period = ?`
      params.push(period)
    }

    sql += ` ORDER BY createdAt DESC`
    const rows = await query<any>(sql, params)
    return ok(rows)
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500)
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)
  const user = session.user as any
  const storeIds: string[] = user.stores?.map((s: any) => s.id) ?? []

  try {
    await ensureTable()
    const b = (await req.json()) as any

    const storeId: string = b.storeId ?? ''
    if (!storeId || !storeIds.includes(storeId)) return err('Store not found', 403)

    if (!VALID_METRICS.includes(b.metric)) return err('Invalid metric', 400)
    if (!VALID_PERIODS.includes(b.period)) return err('Invalid period', 400)

    const target = Number(b.target)
    if (!Number.isFinite(target) || target <= 0) return err('Target must be a positive number', 400)

    const year = Number(b.year)
    if (!Number.isInteger(year) || year < 2000 || year > 2100) return err('Invalid year', 400)

    const month = b.period === 'MONTHLY' ? Number(b.month) : null
    const quarter = b.period === 'QUARTERLY' ? Number(b.quarter) : null

    if (b.period === 'MONTHLY' && (month === null || month < 1 || month > 12)) {
      return err('Invalid month for MONTHLY period', 400)
    }
    if (b.period === 'QUARTERLY' && (quarter === null || quarter < 1 || quarter > 4)) {
      return err('Invalid quarter for QUARTERLY period', 400)
    }

    const id = newId()
    const createdAt = nowISO()

    await exec(
      `INSERT INTO KpiGoal (id, storeId, metric, period, target, actual, year, month, quarter, createdAt)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
      [id, storeId, b.metric, b.period, target, year, month, quarter, createdAt],
    )

    return NextResponse.json({ id, created: true }, { status: 201 })
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500)
  }
}
