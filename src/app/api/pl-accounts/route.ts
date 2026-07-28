// GET/POST /api/pl-accounts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

export type PLCategory = 'REVENUE' | 'COGS' | 'OPEX' | 'OTHER_INCOME' | 'OTHER_EXPENSE'

export interface PLAccount {
  id: string
  storeId: string
  code: string
  name: string
  category: PLCategory
  parentId: string | null
  active: number // 1 | 0 (SQLite boolean)
  createdAt: string
}

const VALID_CATEGORIES: PLCategory[] = ['REVENUE', 'COGS', 'OPEX', 'OTHER_INCOME', 'OTHER_EXPENSE']

export async function ensureTables() {
  await exec(`CREATE TABLE IF NOT EXISTS PLAccount (
    id TEXT PRIMARY KEY,
    storeId TEXT NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'OPEX',
    parentId TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    createdAt TEXT NOT NULL
  )`)
  await exec(`CREATE UNIQUE INDEX IF NOT EXISTS PLAccount_store_code
    ON PLAccount(storeId, code)`)
  await exec(`CREATE TABLE IF NOT EXISTS PLEntry (
    id TEXT PRIMARY KEY,
    storeId TEXT NOT NULL,
    accountId TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    period TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    createdAt TEXT NOT NULL
  )`)
  await exec(`CREATE INDEX IF NOT EXISTS PLEntry_store_period
    ON PLEntry(storeId, period)`)
}

// GET /api/pl-accounts?storeId=xxx&category=REVENUE&activeOnly=true
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

    const category = url.searchParams.get('category')
    const activeOnly = url.searchParams.get('activeOnly') === 'true'

    let sql = `SELECT * FROM PLAccount WHERE storeId = ?`
    const params: unknown[] = [storeId]

    if (category) { sql += ` AND category = ?`; params.push(category) }
    if (activeOnly) { sql += ` AND active = 1` }
    sql += ` ORDER BY category ASC, code ASC`

    const rows = await query<PLAccount>(sql, params)
    return ok(rows)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    return err(msg, 500)
  }
}

// POST /api/pl-accounts?storeId=xxx
// Body: { code, name, category, parentId?, active? }
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

    if (!body.code) return err('code required')
    if (!body.name) return err('name required')
    if (!body.category) return err('category required')
    if (!VALID_CATEGORIES.includes(body.category)) return err('invalid category')

    const code = String(body.code).trim()
    const name = String(body.name).trim()
    const category: PLCategory = body.category
    const parentId: string | null = body.parentId ?? null
    const active: number = body.active === false ? 0 : 1
    const now = nowISO()

    // Check duplicate code within store
    const existing = await query(
      `SELECT id FROM PLAccount WHERE storeId = ? AND code = ?`,
      [storeId, code]
    )
    if ((existing as any[]).length > 0) return err('Account code already exists')

    const id = newId()
    await exec(
      `INSERT INTO PLAccount (id, storeId, code, name, category, parentId, active, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, storeId, code, name, category, parentId, active, now]
    )
    return ok({ id, storeId, code, name, category, parentId, active, createdAt: now }, 201)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    return err(msg, 500)
  }
}
