import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

export async function ensureTables() {
  await exec(`CREATE TABLE IF NOT EXISTS DigitalProduct (
    id          TEXT PRIMARY KEY,
    storeId     TEXT NOT NULL,
    name        TEXT NOT NULL,
    category    TEXT NOT NULL DEFAULT 'TOPUP',
    denomination REAL NOT NULL DEFAULT 0,
    price       REAL NOT NULL DEFAULT 0,
    margin      REAL NOT NULL DEFAULT 0,
    provider    TEXT NOT NULL DEFAULT '',
    active      INTEGER NOT NULL DEFAULT 1,
    createdAt   TEXT NOT NULL,
    updatedAt   TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS DigitalSale (
    id            TEXT PRIMARY KEY,
    storeId       TEXT NOT NULL,
    orderId       TEXT,
    productId     TEXT NOT NULL,
    customerPhone TEXT NOT NULL DEFAULT '',
    serialNumber  TEXT,
    status        TEXT NOT NULL DEFAULT 'PENDING',
    processedAt   TEXT,
    createdAt     TEXT NOT NULL,
    updatedAt     TEXT NOT NULL
  )`)
}

// GET /api/digital-products?storeId=&category=&active=
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const url = new URL(req.url)
    const storeId = url.searchParams.get('storeId') ?? user.stores?.[0]?.id
    if (!storeId) return err('storeId required')

    await ensureTables()

    const conditions: string[] = ['storeId = ?']
    const params: any[] = [storeId]

    const category = url.searchParams.get('category')
    if (category) { conditions.push('category = ?'); params.push(category) }

    const activeParam = url.searchParams.get('active')
    if (activeParam !== null) { conditions.push('active = ?'); params.push(activeParam === '1' || activeParam === 'true' ? 1 : 0) }

    const rows = await query(
      `SELECT * FROM DigitalProduct WHERE ${conditions.join(' AND ')} ORDER BY category ASC, name ASC`,
      params
    )

    const products = (rows as any[]).map(r => ({ ...r, active: Boolean(r.active) }))
    return ok(products)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}

// POST /api/digital-products?storeId=
// Body: { name, category, denomination, price, margin, provider, active? }
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const url = new URL(req.url)
    const storeId = url.searchParams.get('storeId') ?? user.stores?.[0]?.id
    if (!storeId) return err('storeId required')

    await ensureTables()

    const b = (await req.json()) as any
    if (!b.name) return err("Field 'name' is required")
    if (!b.category) return err("Field 'category' is required")

    const VALID_CATEGORIES = ['TOPUP', 'EVOUCHER', 'GAME_CREDIT', 'INTERNET', 'ELECTRICITY']
    if (!VALID_CATEGORIES.includes(b.category)) return err(`Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}`)

    if (b.price == null || isNaN(Number(b.price))) return err("Field 'price' is required")

    const t = nowISO()
    const id = newId()
    await exec(
      `INSERT INTO DigitalProduct (id, storeId, name, category, denomination, price, margin, provider, active, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, storeId, b.name, b.category,
        Number(b.denomination ?? 0),
        Number(b.price),
        Number(b.margin ?? 0),
        b.provider ?? '',
        b.active !== false ? 1 : 0,
        t, t,
      ]
    )
    return ok({ id }, 201)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
