// GET/POST /api/rtv-orders
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

export async function ensureRTVTables() {
  await exec(`CREATE TABLE IF NOT EXISTS RTVOrder (
    id          TEXT PRIMARY KEY,
    storeId     TEXT NOT NULL,
    vendorId    TEXT,
    status      TEXT NOT NULL DEFAULT 'DRAFT',
    reason      TEXT NOT NULL DEFAULT 'DEFECTIVE',
    totalItems  REAL NOT NULL DEFAULT 0,
    totalValue  REAL NOT NULL DEFAULT 0,
    creditNote  REAL,
    notes       TEXT,
    createdAt   TEXT NOT NULL,
    updatedAt   TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS RTVItem (
    id          TEXT PRIMARY KEY,
    rtvId       TEXT NOT NULL,
    storeId     TEXT NOT NULL,
    productId   TEXT NOT NULL,
    qty         REAL NOT NULL DEFAULT 0,
    unitCost    REAL NOT NULL DEFAULT 0,
    totalCost   REAL NOT NULL DEFAULT 0,
    condition   TEXT NOT NULL DEFAULT 'DAMAGED',
    createdAt   TEXT NOT NULL,
    updatedAt   TEXT NOT NULL
  )`)
}

// GET /api/rtv-orders?storeId=&status=&reason=
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

    await ensureRTVTables()

    const status = url.searchParams.get('status')
    const reason = url.searchParams.get('reason')

    let sql = `SELECT * FROM RTVOrder WHERE storeId = ?`
    const params: unknown[] = [storeId]

    if (status) { sql += ` AND status = ?`; params.push(status) }
    if (reason) { sql += ` AND reason = ?`; params.push(reason) }
    sql += ` ORDER BY createdAt DESC`

    const orders = await query(sql, params) as any[]
    return ok(orders)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}

// POST /api/rtv-orders?storeId=
// Body: { vendorId?, reason, notes?, items: [{productId, qty, unitCost, condition}] }
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

    await ensureRTVTables()

    const b = (await req.json()) as any
    if (!b.reason) return err("Field 'reason' is required")
    if (!Array.isArray(b.items) || b.items.length === 0) return err('At least one item required')

    const validReasons = ['DEFECTIVE', 'EXCESS', 'WRONG_ITEM', 'EXPIRED']
    if (!validReasons.includes(b.reason)) return err('Invalid reason')

    for (const item of b.items) {
      if (!item.productId) return err('Each item must have productId')
      if (!item.qty || item.qty <= 0) return err('qty must be > 0')
      if (item.unitCost != null && item.unitCost < 0) return err('unitCost must be >= 0')
    }

    const t = nowISO()
    const id = newId()

    const totalItems = b.items.reduce((s: number, i: any) => s + (i.qty ?? 0), 0)
    const totalValue = b.items.reduce((s: number, i: any) => s + (i.qty ?? 0) * (i.unitCost ?? 0), 0)

    await exec(
      `INSERT INTO RTVOrder (id, storeId, vendorId, status, reason, totalItems, totalValue, notes, createdAt, updatedAt)
       VALUES (?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?)`,
      [id, storeId, b.vendorId ?? null, b.reason, totalItems, totalValue, b.notes ?? null, t, t]
    )

    for (const item of b.items) {
      const itemId = newId()
      const totalCost = (item.qty ?? 0) * (item.unitCost ?? 0)
      await exec(
        `INSERT INTO RTVItem (id, rtvId, storeId, productId, qty, unitCost, totalCost, condition, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [itemId, id, storeId, item.productId, item.qty, item.unitCost ?? 0, totalCost, item.condition ?? 'DAMAGED', t, t]
      )
    }

    return ok({ id }, 201)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
