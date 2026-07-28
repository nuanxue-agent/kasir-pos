// GET/POST /api/tip-pools
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

export async function ensureTables() {
  await exec(`CREATE TABLE IF NOT EXISTS TipPool (
    id        TEXT PRIMARY KEY,
    storeId   TEXT NOT NULL,
    date      TEXT NOT NULL,
    totalTips REAL NOT NULL DEFAULT 0,
    status    TEXT NOT NULL DEFAULT 'OPEN',
    closedAt  TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS TipDistribution (
    id            TEXT PRIMARY KEY,
    poolId        TEXT NOT NULL,
    employeeId    TEXT NOT NULL,
    storeId       TEXT NOT NULL,
    amount        REAL NOT NULL DEFAULT 0,
    role          TEXT NOT NULL DEFAULT 'STAFF',
    hoursWorked   REAL NOT NULL DEFAULT 0,
    distributedAt TEXT NOT NULL
  )`)
}

// GET /api/tip-pools?storeId=&date=&status=
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const url = new URL(req.url)
    const storeId = url.searchParams.get('storeId') ?? user.stores?.[0]?.id
    if (!storeId) return err('storeId required')

    const hasAccess = user.stores?.some((s: { id: string }) => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    await ensureTables()

    const conditions: string[] = ['storeId = ?']
    const params: any[] = [storeId]

    const date = url.searchParams.get('date')
    if (date) { conditions.push('date = ?'); params.push(date) }

    const status = url.searchParams.get('status')
    if (status) { conditions.push('status = ?'); params.push(status) }

    const pools = await query(
      `SELECT * FROM TipPool WHERE ${conditions.join(' AND ')} ORDER BY date DESC, createdAt DESC`,
      params
    )
    return ok(pools)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}

// POST /api/tip-pools?storeId=
// Body: { date, totalTips }
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const url = new URL(req.url)
    const storeId = url.searchParams.get('storeId') ?? user.stores?.[0]?.id
    if (!storeId) return err('storeId required')

    const hasAccess = user.stores?.some((s: { id: string }) => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    await ensureTables()

    const b = (await req.json()) as any
    if (!b.date) return err("Field 'date' is required")
    if (b.totalTips === undefined || b.totalTips === null) return err("Field 'totalTips' is required")
    if (typeof b.totalTips !== 'number' || b.totalTips < 0) return err('totalTips must be a non-negative number')

    const t = nowISO()
    const id = newId()
    await exec(
      `INSERT INTO TipPool (id, storeId, date, totalTips, status, closedAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, 'OPEN', NULL, ?, ?)`,
      [id, storeId, b.date, b.totalTips, t, t]
    )
    return ok({ id }, 201)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
