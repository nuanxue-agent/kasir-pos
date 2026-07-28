import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import { ensureValuationTables } from '@/app/api/inventory-valuation/route'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

// GET /api/inventory-layers?storeId=&method=&productId=
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

    const method = url.searchParams.get('method') ?? 'FIFO'
    const productId = url.searchParams.get('productId')

    let sql = `SELECT il.*, COALESCE(p.name, il.productId) AS productName
               FROM InventoryLayer il
               LEFT JOIN Product p ON p.id = il.productId
               WHERE il.storeId = ? AND il.method = ?`
    const params: unknown[] = [storeId, method]

    if (productId) { sql += ` AND il.productId = ?`; params.push(productId) }
    sql += ` ORDER BY il.receivedAt ASC`

    const rows = await query(sql, params) as any[]
    return ok(rows)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}

// POST /api/inventory-layers?storeId=
// Body: { productId, qty, costPrice, receivedAt?, method? }
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

    const validMethods = ['FIFO', 'AVCO', 'LIFO']
    const method = b.method ?? 'FIFO'
    if (!validMethods.includes(method)) return err('Invalid method')

    const t = nowISO()
    const id = newId()
    const receivedAt = b.receivedAt ?? t

    await exec(
      `INSERT INTO InventoryLayer (id, storeId, productId, qty, costPrice, remainingQty, receivedAt, method, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, storeId, b.productId, b.qty, b.costPrice, b.qty, receivedAt, method, t, t]
    )

    return ok({ id }, 201)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
