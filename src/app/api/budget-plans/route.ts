// GET/POST /api/budget-plans
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

export type BudgetPlanStatus = 'DRAFT' | 'APPROVED' | 'LOCKED'

export interface BudgetPlan {
  id: string
  storeId: string
  year: number
  name: string
  status: BudgetPlanStatus
  totalRevenueBudget: number
  totalExpenseBudget: number
  approvedBy: string | null
  approvedAt: string | null
  createdAt: string
  updatedAt: string
}

export async function ensureTables() {
  await exec(`CREATE TABLE IF NOT EXISTS BudgetPlan (
    id TEXT PRIMARY KEY,
    storeId TEXT NOT NULL,
    year INTEGER NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'DRAFT',
    totalRevenueBudget REAL NOT NULL DEFAULT 0,
    totalExpenseBudget REAL NOT NULL DEFAULT 0,
    approvedBy TEXT,
    approvedAt TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`)
  await exec(`CREATE UNIQUE INDEX IF NOT EXISTS BudgetPlan_store_year
    ON BudgetPlan(storeId, year)`)

  await exec(`CREATE TABLE IF NOT EXISTS BudgetLine (
    id TEXT PRIMARY KEY,
    planId TEXT NOT NULL,
    storeId TEXT NOT NULL,
    accountCode TEXT NOT NULL DEFAULT '',
    accountName TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT 'REVENUE',
    q1 REAL NOT NULL DEFAULT 0,
    q2 REAL NOT NULL DEFAULT 0,
    q3 REAL NOT NULL DEFAULT 0,
    q4 REAL NOT NULL DEFAULT 0,
    annual REAL NOT NULL DEFAULT 0,
    actualQ1 REAL NOT NULL DEFAULT 0,
    actualQ2 REAL NOT NULL DEFAULT 0,
    actualQ3 REAL NOT NULL DEFAULT 0,
    actualQ4 REAL NOT NULL DEFAULT 0,
    actualAnnual REAL NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`)
  await exec(`CREATE INDEX IF NOT EXISTS BudgetLine_planId ON BudgetLine(planId)`)
  await exec(`CREATE INDEX IF NOT EXISTS BudgetLine_storeId ON BudgetLine(storeId)`)
}

// GET /api/budget-plans?storeId=xxx&year=2025
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const url = new URL(req.url)
    const storeId = url.searchParams.get('storeId')
    if (!storeId) return err('storeId required')

    const hasAccess = user.stores?.some((s: { id: string }) => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    await ensureTables()

    const year = url.searchParams.get('year')
    let sql = `SELECT * FROM BudgetPlan WHERE storeId = ?`
    const params: unknown[] = [storeId]
    if (year) { sql += ` AND year = ?`; params.push(Number(year)) }
    sql += ` ORDER BY year DESC`

    const rows = await query<BudgetPlan>(sql, params)
    return ok(rows)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    return err(msg, 500)
  }
}

// POST /api/budget-plans?storeId=xxx
// Body: { year, name? }
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const url = new URL(req.url)
    const storeId = url.searchParams.get('storeId')
    if (!storeId) return err('storeId required')

    const hasAccess = user.stores?.some((s: { id: string }) => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    await ensureTables()

    const body = await req.json() as any
    if (!body.year) return err('year required')

    const year = Number(body.year)
    if (isNaN(year) || year < 2000 || year > 2100) return err('invalid year')

    const name = String(body.name ?? `Anggaran ${year}`)
    const now = nowISO()
    const id = newId()

    // check existing
    const existing = await query<BudgetPlan>(
      `SELECT id FROM BudgetPlan WHERE storeId = ? AND year = ?`,
      [storeId, year]
    )
    if ((existing as any[]).length > 0) return err('Budget plan for this year already exists')

    await exec(
      `INSERT INTO BudgetPlan (id, storeId, year, name, status, totalRevenueBudget, totalExpenseBudget, approvedBy, approvedAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, 'DRAFT', 0, 0, NULL, NULL, ?, ?)`,
      [id, storeId, year, name, now, now]
    )

    return ok({ id, storeId, year, name, status: 'DRAFT', totalRevenueBudget: 0, totalExpenseBudget: 0, approvedBy: null, approvedAt: null, createdAt: now, updatedAt: now }, 201)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    return err(msg, 500)
  }
}
