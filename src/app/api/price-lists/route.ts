// GET/POST /api/price-lists
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

export async function ensurePriceListTables() {
  await exec(`CREATE TABLE IF NOT EXISTS PriceList (
    id            TEXT PRIMARY KEY,
    storeId       TEXT NOT NULL,
    name          TEXT NOT NULL,
    description   TEXT,
    type          TEXT NOT NULL DEFAULT 'RETAIL',
    discountType  TEXT NOT NULL DEFAULT 'PERCENTAGE',
    discountValue REAL NOT NULL DEFAULT 0,
    active        INTEGER NOT NULL DEFAULT 1,
    validFrom     TEXT,
    validTo       TEXT,
    createdAt     TEXT NOT NULL,
    updatedAt     TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS PriceListItem (
    id          TEXT PRIMARY KEY,
    priceListId TEXT NOT NULL,
    storeId     TEXT NOT NULL,
    productId   TEXT NOT NULL,
    price       REAL NOT NULL DEFAULT 0,
    minQty      REAL NOT NULL DEFAULT 1,
    createdAt   TEXT NOT NULL,
    updatedAt   TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS CustomerPriceList (
    id          TEXT PRIMARY KEY,
    customerId  TEXT NOT NULL,
    storeId     TEXT NOT NULL,
    priceListId TEXT NOT NULL,
    assignedAt  TEXT NOT NULL
  )`)
}

// GET /api/price-lists?storeId=&type=&active=
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

    await ensurePriceListTables()

    const type = url.searchParams.get('type')
    const active = url.searchParams.get('active')

    let sql = `SELECT * FROM PriceList WHERE storeId = ?`
    const params: unknown[] = [storeId]

    if (type) { sql += ` AND type = ?`; params.push(type) }
    if (active !== null) { sql += ` AND active = ?`; params.push(active === '1' || active === 'true' ? 1 : 0) }
    sql += ` ORDER BY createdAt DESC`

    const rows = await query(sql, params) as any[]
    const enriched = rows.map(r => ({ ...r, active: Boolean(r.active) }))
    return ok(enriched)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}

// POST /api/price-lists
// Body: { storeId, name, description?, type, discountType, discountValue, active?, validFrom?, validTo? }
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    await ensurePriceListTables()

    const b = (await req.json()) as any
    if (!b.storeId) return err('storeId required')
    if (!b.name?.trim()) return err('name required')
    if (!['RETAIL', 'WHOLESALE', 'VIP', 'CUSTOM'].includes(b.type)) return err('type must be RETAIL, WHOLESALE, VIP, or CUSTOM')
    if (!['FIXED', 'PERCENTAGE'].includes(b.discountType)) return err('discountType must be FIXED or PERCENTAGE')
    if (b.discountValue == null || b.discountValue < 0) return err('discountValue must be >= 0')

    const hasAccess = user.stores?.some((s: { id: string }) => s.id === b.storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    const t = nowISO()
    const id = newId()

    await exec(
      `INSERT INTO PriceList (id, storeId, name, description, type, discountType, discountValue, active, validFrom, validTo, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, b.storeId, b.name.trim(), b.description ?? null, b.type, b.discountType,
       b.discountValue, b.active !== false ? 1 : 0, b.validFrom ?? null, b.validTo ?? null, t, t]
    )

    return ok({ id }, 201)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
