import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status })
}
function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

async function ensureTables() {
  await exec(`CREATE TABLE IF NOT EXISTS FlashSale (
    id        TEXT PRIMARY KEY,
    storeId   TEXT NOT NULL,
    name      TEXT NOT NULL,
    startAt   TEXT NOT NULL,
    endAt     TEXT NOT NULL,
    status    TEXT NOT NULL DEFAULT 'SCHEDULED',
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS FlashSaleItem (
    id            TEXT PRIMARY KEY,
    saleId        TEXT NOT NULL,
    storeId       TEXT NOT NULL,
    productId     TEXT NOT NULL,
    originalPrice REAL NOT NULL DEFAULT 0,
    salePrice     REAL NOT NULL DEFAULT 0,
    discountPct   REAL NOT NULL DEFAULT 0,
    stockLimit    INTEGER NOT NULL DEFAULT 0,
    soldQty       INTEGER NOT NULL DEFAULT 0,
    active        INTEGER NOT NULL DEFAULT 1,
    createdAt     TEXT NOT NULL,
    updatedAt     TEXT NOT NULL
  )`)
}

// GET /api/flash-sales?storeId=xxx&status=ACTIVE
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)

    const user = session.user as any
    const sp = new URL(req.url).searchParams
    const urlStoreId = sp.get('storeId')
    const statusFilter = sp.get('status')

    const storeId: string =
      (urlStoreId && user.stores?.some((s: any) => s.id === urlStoreId) ? urlStoreId : null) ??
      user.stores?.[0]?.id ?? ''
    if (!storeId) return err('Forbidden', 403)

    await ensureTables()

    let sql = `SELECT * FROM FlashSale WHERE storeId = ?`
    const params: unknown[] = [storeId]
    if (statusFilter) {
      sql += ` AND status = ?`
      params.push(statusFilter)
    }
    sql += ` ORDER BY startAt DESC`

    const rows = await query(sql, params)
    return ok(rows)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}

// POST /api/flash-sales
// Body: { storeId?, name, startAt, endAt, status? }
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)

    const body = (await req.json()) as any
    const user = session.user as any
    const storeId: string = body.storeId ?? user.stores?.[0]?.id ?? ''
    if (!storeId) return err('storeId required')
    const hasAccess = user.stores?.some((s: any) => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    if (!body.name?.trim()) return err('name is required')
    if (!body.startAt) return err('startAt is required')
    if (!body.endAt) return err('endAt is required')
    const start = new Date(body.startAt).getTime()
    const end   = new Date(body.endAt).getTime()
    if (isNaN(start)) return err('startAt is invalid')
    if (isNaN(end))   return err('endAt is invalid')
    if (end <= start) return err('endAt must be after startAt')

    await ensureTables()

    const id = newId()
    const now = nowISO()
    const status = body.status ?? 'SCHEDULED'

    await exec(
      `INSERT INTO FlashSale (id, storeId, name, startAt, endAt, status, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, storeId, body.name.trim(), body.startAt, body.endAt, status, now, now],
    )

    return ok({ id, storeId, name: body.name.trim(), startAt: body.startAt, endAt: body.endAt, status, createdAt: now }, 201)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
