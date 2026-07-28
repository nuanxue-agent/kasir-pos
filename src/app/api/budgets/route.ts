// GET/POST /api/budgets
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

export type BudgetCategory =
  | 'REVENUE'
  | 'COGS'
  | 'OPERATING_EXPENSE'
  | 'MARKETING'
  | 'SALARY'
  | 'RENT'
  | 'UTILITIES'
  | 'OTHER_EXPENSE'

export interface BudgetRow {
  id: string
  storeId: string
  year: number
  category: BudgetCategory
  month: number          // 1-12
  budgetAmount: number
  actualAmount: number
  notes: string
  createdAt: string
  updatedAt: string
}

export async function ensureTables() {
  await exec(`CREATE TABLE IF NOT EXISTS Budget (
    id TEXT PRIMARY KEY,
    storeId TEXT NOT NULL,
    year INTEGER NOT NULL,
    category TEXT NOT NULL DEFAULT 'REVENUE',
    month INTEGER NOT NULL,
    budgetAmount REAL NOT NULL DEFAULT 0,
    actualAmount REAL NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`)
  await exec(`CREATE UNIQUE INDEX IF NOT EXISTS Budget_store_year_cat_month
    ON Budget(storeId, year, category, month)`)
}

// GET /api/budgets?storeId=xxx&year=2025
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
    const category = url.searchParams.get('category')

    let sql = `SELECT * FROM Budget WHERE storeId = ?`
    const params: unknown[] = [storeId]

    if (year) { sql += ` AND year = ?`; params.push(Number(year)) }
    if (category) { sql += ` AND category = ?`; params.push(category) }
    sql += ` ORDER BY year DESC, month ASC, category ASC`

    const rows = await query<BudgetRow>(sql, params)
    return ok(rows)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    return err(msg, 500)
  }
}

// POST /api/budgets?storeId=xxx
// Body: { year, category, month, budgetAmount, actualAmount?, notes? }
//   OR: { copyFromYear, toYear } — bulk-copy last year rows
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

    // ── Copy-year shortcut ────────────────────────────────────────────────────
    if (body.copyFromYear != null && body.toYear != null) {
      const fromYear = Number(body.copyFromYear)
      const toYear = Number(body.toYear)
      if (isNaN(fromYear) || isNaN(toYear)) return err('copyFromYear and toYear must be numbers')

      const source = await query<BudgetRow>(
        `SELECT * FROM Budget WHERE storeId = ? AND year = ?`,
        [storeId, fromYear]
      )
      if (source.length === 0) return err('No budget rows found for source year')

      const now = nowISO()
      let inserted = 0
      for (const row of source) {
        const existing = await query(
          `SELECT id FROM Budget WHERE storeId = ? AND year = ? AND category = ? AND month = ?`,
          [storeId, toYear, row.category, row.month]
        )
        if ((existing as any[]).length > 0) continue // skip existing
        await exec(
          `INSERT INTO Budget (id, storeId, year, category, month, budgetAmount, actualAmount, notes, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
          [newId(), storeId, toYear, row.category, row.month, row.budgetAmount, row.notes ?? '', now, now]
        )
        inserted++
      }
      return ok({ copied: inserted }, 201)
    }

    // ── Single row upsert ─────────────────────────────────────────────────────
    const VALID_CATEGORIES: BudgetCategory[] = [
      'REVENUE', 'COGS', 'OPERATING_EXPENSE', 'MARKETING',
      'SALARY', 'RENT', 'UTILITIES', 'OTHER_EXPENSE',
    ]

    if (!body.year) return err('year required')
    if (!body.category) return err('category required')
    if (!VALID_CATEGORIES.includes(body.category)) return err('invalid category')
    if (body.month == null) return err('month required')

    const year = Number(body.year)
    const month = Number(body.month)
    if (month < 1 || month > 12) return err('month must be 1-12')
    const budgetAmount = Number(body.budgetAmount ?? 0)
    const actualAmount = Number(body.actualAmount ?? 0)
    const notes = String(body.notes ?? '')
    const now = nowISO()

    // upsert
    const existing = await query<BudgetRow>(
      `SELECT id FROM Budget WHERE storeId = ? AND year = ? AND category = ? AND month = ?`,
      [storeId, year, body.category, month]
    )

    if ((existing as any[]).length > 0) {
      const id = (existing as any[])[0].id
      await exec(
        `UPDATE Budget SET budgetAmount = ?, actualAmount = ?, notes = ?, updatedAt = ? WHERE id = ?`,
        [budgetAmount, actualAmount, notes, now, id]
      )
      return ok({ id, storeId, year, category: body.category, month, budgetAmount, actualAmount, notes })
    }

    const id = newId()
    await exec(
      `INSERT INTO Budget (id, storeId, year, category, month, budgetAmount, actualAmount, notes, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, storeId, year, body.category, month, budgetAmount, actualAmount, notes, now, now]
    )
    return ok({ id, storeId, year, category: body.category, month, budgetAmount, actualAmount, notes, createdAt: now, updatedAt: now }, 201)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    return err(msg, 500)
  }
}
