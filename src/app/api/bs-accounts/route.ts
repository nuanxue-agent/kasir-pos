// GET/POST /api/bs-accounts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

export type BSCategory =
  | 'CURRENT_ASSET'
  | 'FIXED_ASSET'
  | 'CURRENT_LIABILITY'
  | 'LONG_TERM_LIABILITY'
  | 'EQUITY'

export interface BSAccount {
  id: string
  storeId: string
  code: string
  name: string
  category: BSCategory
  parentId: string | null
  active: number // 1 | 0 (SQLite boolean)
  createdAt: string
}

const VALID_CATEGORIES: BSCategory[] = [
  'CURRENT_ASSET',
  'FIXED_ASSET',
  'CURRENT_LIABILITY',
  'LONG_TERM_LIABILITY',
  'EQUITY',
]

export async function ensureTables() {
  await exec(`CREATE TABLE IF NOT EXISTS BSAccount (
    id TEXT PRIMARY KEY,
    storeId TEXT NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'CURRENT_ASSET',
    parentId TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    createdAt TEXT NOT NULL
  )`)
  await exec(`CREATE UNIQUE INDEX IF NOT EXISTS BSAccount_store_code
    ON BSAccount(storeId, code)`)
  await exec(`CREATE TABLE IF NOT EXISTS BSEntry (
    id TEXT PRIMARY KEY,
    storeId TEXT NOT NULL,
    accountId TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    period TEXT NOT NULL,
    createdAt TEXT NOT NULL
  )`)
  await exec(`CREATE INDEX IF NOT EXISTS BSEntry_store_period
    ON BSEntry(storeId, period)`)
}

// GET /api/bs-accounts?storeId=xxx&category=CURRENT_ASSET&activeOnly=true
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

    let sql = `SELECT * FROM BSAccount WHERE storeId = ?`
    const params: unknown[] = [storeId]

    if (category && VALID_CATEGORIES.includes(category as BSCategory)) {
      sql += ` AND category = ?`
      params.push(category)
    }
    if (activeOnly) {
      sql += ` AND active = 1`
    }
    sql += ` ORDER BY category ASC, code ASC`

    const accounts = await query<BSAccount>(sql, params)
    return ok(accounts)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    return err(msg, 500)
  }
}

// POST /api/bs-accounts — create account
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

    const body = await req.json() as any
    const { code, name, category, parentId } = body

    if (!code?.trim()) return err('code required')
    if (!name?.trim()) return err('name required')
    if (!category || !VALID_CATEGORIES.includes(category)) {
      return err(`category must be one of: ${VALID_CATEGORIES.join(', ')}`)
    }

    await ensureTables()

    const id = newId()
    const createdAt = nowISO()

    await exec(
      `INSERT INTO BSAccount (id, storeId, code, name, category, parentId, active, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
      [id, storeId, code.trim(), name.trim(), category, parentId ?? null, createdAt]
    )

    const account = await query<BSAccount>(
      `SELECT * FROM BSAccount WHERE id = ?`,
      [id]
    )

    return ok(account[0] ?? { id }, 201)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    if (msg.includes('UNIQUE')) return err('Kode akun sudah digunakan', 409)
    return err(msg, 500)
  }
}
