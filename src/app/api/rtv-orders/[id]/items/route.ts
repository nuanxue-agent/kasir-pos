// GET/POST /api/rtv-orders/[id]/items
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

// GET /api/rtv-orders/[id]/items
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const { id } = await params

    const orders = await query(`SELECT * FROM RTVOrder WHERE id = ?`, [id]) as any[]
    if (orders.length === 0) return err('RTV order not found', 404)
    const order = orders[0]

    const hasAccess = user.stores?.some((s: { id: string }) => s.id === order.storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    const items = await query(
      `SELECT i.*, p.name as productName, p.sku
       FROM RTVItem i
       LEFT JOIN Product p ON p.id = i.productId
       WHERE i.rtvId = ?
       ORDER BY i.createdAt ASC`,
      [id]
    ) as any[]

    return ok(items)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}

// POST /api/rtv-orders/[id]/items
// Body: { productId, qty, unitCost, condition? }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const { id } = await params

    const orders = await query(`SELECT * FROM RTVOrder WHERE id = ?`, [id]) as any[]
    if (orders.length === 0) return err('RTV order not found', 404)
    const order = orders[0]

    const hasAccess = user.stores?.some((s: { id: string }) => s.id === order.storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    if (order.status !== 'DRAFT') return err('Can only add items to DRAFT orders')

    const b = (await req.json()) as any
    if (!b.productId) return err('productId required')
    if (!b.qty || b.qty <= 0) return err('qty must be > 0')
    if (b.unitCost != null && b.unitCost < 0) return err('unitCost must be >= 0')

    const validConditions = ['DAMAGED', 'UNOPENED', 'OPENED', 'EXPIRED']
    const condition = b.condition ?? 'DAMAGED'
    if (!validConditions.includes(condition)) return err('Invalid condition')

    const t = nowISO()
    const itemId = newId()
    const totalCost = (b.qty ?? 0) * (b.unitCost ?? 0)

    await exec(
      `INSERT INTO RTVItem (id, rtvId, storeId, productId, qty, unitCost, totalCost, condition, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [itemId, id, order.storeId, b.productId, b.qty, b.unitCost ?? 0, totalCost, condition, t, t]
    )

    // Update order totals
    const allItems = await query(`SELECT qty, unitCost FROM RTVItem WHERE rtvId = ?`, [id]) as any[]
    const newTotalItems = allItems.reduce((s: number, i: any) => s + i.qty, 0)
    const newTotalValue = allItems.reduce((s: number, i: any) => s + i.qty * i.unitCost, 0)
    await exec(
      `UPDATE RTVOrder SET totalItems = ?, totalValue = ?, updatedAt = ? WHERE id = ?`,
      [newTotalItems, newTotalValue, t, id]
    )

    return ok({ id: itemId }, 201)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
