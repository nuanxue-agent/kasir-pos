// GET/POST /api/cash-flow-forecast
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

export interface CashFlowForecastRow {
  id: string
  storeId: string
  date: string
  projectedInflow: number
  projectedOutflow: number
  projectedBalance: number
  actualInflow: number
  actualOutflow: number
  actualBalance: number
  notes: string
  createdAt: string
  updatedAt: string
}

export async function ensureTables() {
  await exec(`CREATE TABLE IF NOT EXISTS CashFlowForecast (
    id               TEXT PRIMARY KEY,
    storeId          TEXT NOT NULL,
    date             TEXT NOT NULL,
    projectedInflow  REAL NOT NULL DEFAULT 0,
    projectedOutflow REAL NOT NULL DEFAULT 0,
    projectedBalance REAL NOT NULL DEFAULT 0,
    actualInflow     REAL NOT NULL DEFAULT 0,
    actualOutflow    REAL NOT NULL DEFAULT 0,
    actualBalance    REAL NOT NULL DEFAULT 0,
    notes            TEXT NOT NULL DEFAULT '',
    createdAt        TEXT NOT NULL,
    updatedAt        TEXT NOT NULL
  )`)
  await exec(`CREATE UNIQUE INDEX IF NOT EXISTS CashFlowForecast_store_date
    ON CashFlowForecast(storeId, date)`)
}

// GET /api/cash-flow-forecast?storeId=xxx&days=30
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

    const days = parseInt(url.searchParams.get('days') ?? '90', 10)

    await ensureTables()

    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() + days)
    const rows = await query(
      `SELECT * FROM CashFlowForecast
       WHERE storeId = ? AND date <= ?
       ORDER BY date ASC`,
      [storeId, cutoff.toISOString().slice(0, 10)]
    )

    return ok(rows)
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500)
  }
}

// POST /api/cash-flow-forecast
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

    const projectedInflow  = Number(b.projectedInflow  ?? 0)
    const projectedOutflow = Number(b.projectedOutflow ?? 0)
    const projectedBalance = Number(b.projectedBalance ?? projectedInflow - projectedOutflow)
    const actualInflow     = Number(b.actualInflow  ?? 0)
    const actualOutflow    = Number(b.actualOutflow ?? 0)
    const actualBalance    = Number(b.actualBalance ?? actualInflow - actualOutflow)
    const notes            = b.notes ?? ''

    const t  = nowISO()
    const id = newId()

    await exec(
      `INSERT INTO CashFlowForecast
         (id, storeId, date, projectedInflow, projectedOutflow, projectedBalance,
          actualInflow, actualOutflow, actualBalance, notes, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, storeId, b.date, projectedInflow, projectedOutflow, projectedBalance,
       actualInflow, actualOutflow, actualBalance, notes, t, t]
    )

    return ok({ id }, 201)
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500)
  }
}
