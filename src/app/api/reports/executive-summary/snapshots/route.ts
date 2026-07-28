// GET  /api/reports/executive-summary/snapshots?storeId= — list saved snapshots
// POST /api/reports/executive-summary/snapshots?storeId= — save a snapshot
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

async function ensureExecReportTable() {
  await exec(`CREATE TABLE IF NOT EXISTS ExecReport (
    id          TEXT PRIMARY KEY,
    storeId     TEXT NOT NULL,
    period      TEXT NOT NULL,
    generatedAt TEXT NOT NULL,
    data        TEXT NOT NULL,
    createdAt   TEXT NOT NULL
  )`)
  await exec(`CREATE UNIQUE INDEX IF NOT EXISTS ExecReport_store_period
    ON ExecReport(storeId, period)`)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)
  const user = session.user as any

  const sp = req.nextUrl.searchParams
  const storeId = sp.get('storeId') ?? user.stores?.[0]?.id ?? ''
  if (!storeId) return err('storeId required', 400)

  const storeIds: string[] = user.stores?.map((s: any) => s.id) ?? []
  if (!storeIds.includes(storeId)) return err('Store not found', 403)

  await ensureExecReportTable()

  const rows = await query(
    `SELECT id, storeId, period, generatedAt, createdAt FROM ExecReport
     WHERE storeId = ? ORDER BY period DESC LIMIT 24`,
    [storeId]
  )

  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)
  const user = session.user as any

  const sp = req.nextUrl.searchParams
  const storeId = sp.get('storeId') ?? user.stores?.[0]?.id ?? ''
  if (!storeId) return err('storeId required', 400)

  const storeIds: string[] = user.stores?.map((s: any) => s.id) ?? []
  if (!storeIds.includes(storeId)) return err('Store not found', 403)

  await ensureExecReportTable()

  const b = (await req.json()) as any
  if (!b.period) return err("Field 'period' is required", 400)
  if (!b.data) return err("Field 'data' is required", 400)

  const id = newId()
  const t = nowISO()
  const generatedAt = b.generatedAt ?? t
  const dataStr = typeof b.data === 'string' ? b.data : JSON.stringify(b.data)

  // Upsert: if snapshot for this period already exists, replace it
  await exec(
    `INSERT OR REPLACE INTO ExecReport (id, storeId, period, generatedAt, data, createdAt)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, storeId, b.period, generatedAt, dataStr, t]
  )

  return NextResponse.json({ id, period: b.period }, { status: 201 })
}
