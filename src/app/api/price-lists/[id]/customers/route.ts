// GET/POST /api/price-lists/[id]/customers
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, queryOne, newId, nowISO } from '@/lib/db'
import { ensurePriceListTables } from '../../route'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

// GET /api/price-lists/[id]/customers
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    await ensurePriceListTables()

    const { id } = await params
    const pl = await queryOne(`SELECT * FROM PriceList WHERE id = ?`, [id]) as any
    if (!pl) return err('Price list not found', 404)

    const hasAccess = user.stores?.some((s: { id: string }) => s.id === pl.storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    const rows = await query(
      `SELECT cpl.*, c.name AS customerName, c.phone AS customerPhone
       FROM CustomerPriceList cpl
       LEFT JOIN Customer c ON c.id = cpl.customerId
       WHERE cpl.priceListId = ?
       ORDER BY cpl.assignedAt DESC`,
      [id]
    ) as any[]

    return ok(rows)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}

// POST /api/price-lists/[id]/customers
// Body: { customerId } — assign a customer to this price list
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    await ensurePriceListTables()

    const { id } = await params
    const pl = await queryOne(`SELECT * FROM PriceList WHERE id = ?`, [id]) as any
    if (!pl) return err('Price list not found', 404)

    const hasAccess = user.stores?.some((s: { id: string }) => s.id === pl.storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    const b = (await req.json()) as any
    if (!b.customerId) return err('customerId required')

    // Check for duplicate assignment — one active price list per customer per store
    const existing = await queryOne(
      `SELECT id FROM CustomerPriceList WHERE customerId = ? AND storeId = ? AND priceListId = ?`,
      [b.customerId, pl.storeId, id]
    ) as any
    if (existing) return err('Customer already assigned to this price list')

    const t = nowISO()
    const assignId = newId()

    await exec(
      `INSERT INTO CustomerPriceList (id, customerId, storeId, priceListId, assignedAt)
       VALUES (?, ?, ?, ?, ?)`,
      [assignId, b.customerId, pl.storeId, id, t]
    )

    return ok({ id: assignId }, 201)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
