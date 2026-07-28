import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import { ensureValuationTables } from '@/app/api/inventory-valuation/route'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

// GET /api/cogs-entries?storeId=&productId=&from=&to=
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

    await ensureValuationTables()

    const productId = url.searchParams.get('productId')
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')

    let sql = `SELECT ce.*, COALESCE(p.name, ce.productId) AS productName
               FROM COGSEntry ce
               LEFT JOIN Product p ON p.id = ce.productId
               WHERE ce.storeId = ?`
    const params: unknown[] = [storeId]

    if (productId) { sql += ` AND ce.productId = ?`; params.push(productId) }
    if (from) { sql += ` AND ce.soldAt >= ?`; params.push(from) }
    if (to) { sql += ` AND ce.soldAt <= ?`; params.push(to) }
    sql += ` ORDER BY ce.soldAt DESC LIMIT 500`

    const rows = await query(sql, params) as any[]
    return ok(rows)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}

// POST /api/cogs-entries?storeId=
// Body: { productId, qty, costPrice, orderId?, soldAt? }
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

    await ensureValuationTables()

    const b = (await req.json()) as any
    if (!b.productId) return err("Field 'productId' is required")
    if (!b.qty || b.qty <= 0) return err('qty must be > 0')
    if (b.costPrice == null || b.costPrice < 0) return err('costPrice must be >= 0')

    const t = nowISO()
    const id = newId()
    const totalCost = (b.qty as number) * (b.costPrice as number)
    const soldAt = b.soldAt ?? t

    await exec(
      `INSERT INTO COGSEntry (id, storeId, productId, qty, costPrice, totalCost, orderId, soldAt, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, storeId, b.productId, b.qty, b.costPrice, totalCost, b.orderId ?? null, soldAt, t]
    )

    return ok({ id, totalCost }, 201)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
