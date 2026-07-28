// GET/POST /api/accounts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE'

export async function ensureTables() {
  await exec(`CREATE TABLE IF NOT EXISTS Account (
    id          TEXT PRIMARY KEY,
    storeId     TEXT NOT NULL,
    code        TEXT NOT NULL,
    name        TEXT NOT NULL,
    type        TEXT NOT NULL DEFAULT 'ASSET',
    subtype     TEXT,
    parentId    TEXT,
    level       INTEGER NOT NULL DEFAULT 0,
    active      INTEGER NOT NULL DEFAULT 1,
    description TEXT,
    isSystem    INTEGER NOT NULL DEFAULT 0,
    balance     REAL NOT NULL DEFAULT 0,
    createdAt   TEXT NOT NULL,
    updatedAt   TEXT NOT NULL,
    UNIQUE(storeId, code)
  )`)
}

// GET /api/accounts?storeId=xxx&type=ASSET&active=1
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

    let sql = `SELECT * FROM Account WHERE storeId = ?`
    const params: unknown[] = [storeId]

    const type = url.searchParams.get('type')
    const active = url.searchParams.get('active')
    if (type) { sql += ` AND type = ?`; params.push(type) }
    if (active != null) { sql += ` AND active = ?`; params.push(active === '1' ? 1 : 0) }

    sql += ` ORDER BY code ASC`

    const accounts = await query<Record<string, unknown>>(sql, params)
    return ok(accounts)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    return err(msg, 500)
  }
}

// POST /api/accounts?storeId=xxx
// Body: { code, name, type, subtype?, parentId?, level?, description?, openingBalance? }
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

    const body = await req.json() as {
      code?: string
      name?: string
      type?: AccountType
      subtype?: string
      parentId?: string
      level?: number
      description?: string
      openingBalance?: number
    }

    if (!body.code?.trim()) return err('code required')
    if (!/^\d{4,6}$/.test(body.code.trim())) return err('code must be 4–6 numeric digits')
    if (!body.name?.trim()) return err('name required')

    const VALID_TYPES: AccountType[] = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']
    if (!body.type || !VALID_TYPES.includes(body.type)) return err('type must be one of ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE')

    // Check for duplicate code
    const existing = await query<{ id: string }>(
      `SELECT id FROM Account WHERE storeId = ? AND code = ?`,
      [storeId, body.code.trim()]
    )
    if (existing.length > 0) return err(`Account code ${body.code} already exists`)

    // Validate parentId if provided
    if (body.parentId) {
      const parent = await query<{ id: string; storeId: string }>(
        `SELECT id, storeId FROM Account WHERE id = ? AND storeId = ?`,
        [body.parentId, storeId]
      )
      if (parent.length === 0) return err('parentId not found')
    }

    const id = newId()
    const now = nowISO()
    const balance = Number(body.openingBalance ?? 0)
    const level = Number(body.level ?? (body.parentId ? 1 : 0))

    await exec(
      `INSERT INTO Account (id, storeId, code, name, type, subtype, parentId, level, active, description, isSystem, balance, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 0, ?, ?, ?)`,
      [id, storeId, body.code.trim(), body.name.trim(), body.type,
       body.subtype ?? null, body.parentId ?? null, level,
       body.description ?? null, balance, now, now]
    )

    return ok({ id, storeId, code: body.code.trim(), name: body.name.trim(), type: body.type,
      subtype: body.subtype ?? null, parentId: body.parentId ?? null, level, active: 1,
      description: body.description ?? null, isSystem: 0, balance, createdAt: now, updatedAt: now }, 201)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    return err(msg, 500)
  }
}
