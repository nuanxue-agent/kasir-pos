// GET   /api/stocktakes/[id]/items?storeId=
// POST  /api/stocktakes/[id]/items?storeId=  — bulk upsert counted qty
// PATCH /api/stocktakes/[id]/items?storeId=  — update individual item
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, nowISO } from '@/lib/db'
import { ensureStocktakeTables } from '../../route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')

  const { id } = await params
  const storeId = req.nextUrl.searchParams.get('storeId') ?? ''

  await ensureStocktakeTables()

  const items = await query(
    `SELECT si.*, p.name AS productName, p.sku AS productSku, p.cost
     FROM StocktakeItem si
     JOIN Product p ON p.id = si.productId
     WHERE si.stocktakeId = ?
     ORDER BY p.name ASC`,
    [id],
  )

  return NextResponse.json(items)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')

  const { id } = await params
  await ensureStocktakeTables()

  const b = (await req.json()) as any
  if (!b.items || !Array.isArray(b.items)) return err('items array required', 400, 'MISSING_FIELD')

  const t = nowISO()

  for (const item of b.items) {
    const countedQty = item.countedQty ?? null
    const variance = countedQty !== null ? countedQty - item.systemQty : 0

    await exec(
      `UPDATE StocktakeItem
       SET countedQty = ?, variance = ?, notes = ?, updatedAt = ?
       WHERE stocktakeId = ? AND productId = ?`,
      [countedQty, variance, item.notes ?? null, t, id, item.productId],
    )
  }

  const items = await query(
    `SELECT si.*, p.name AS productName, p.sku AS productSku
     FROM StocktakeItem si
     JOIN Product p ON p.id = si.productId
     WHERE si.stocktakeId = ?
     ORDER BY p.name ASC`,
    [id],
  )

  return NextResponse.json(items)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')

  const { id } = await params
  await ensureStocktakeTables()

  const b = (await req.json()) as any
  if (!b.productId) return err('productId required', 400, 'MISSING_FIELD')

  const rows = await query(
    `SELECT * FROM StocktakeItem WHERE stocktakeId = ? AND productId = ?`,
    [id, b.productId],
  )
  if (rows.length === 0) return err('Item not found', 404, 'NOT_FOUND')

  const item = rows[0] as any
  const sets: string[] = []
  const vals: any[] = []
  const t = nowISO()

  if (b.countedQty !== undefined) {
    sets.push('countedQty = ?')
    vals.push(b.countedQty)
    const variance = b.countedQty !== null ? b.countedQty - item.systemQty : 0
    sets.push('variance = ?')
    vals.push(variance)
  }

  if (b.notes !== undefined) { sets.push('notes = ?'); vals.push(b.notes) }

  if (sets.length === 0) return err('No fields to update', 400, 'NO_FIELDS')
  sets.push('updatedAt = ?')
  vals.push(t)
  vals.push(id)
  vals.push(b.productId)

  await exec(
    `UPDATE StocktakeItem SET ${sets.join(', ')} WHERE stocktakeId = ? AND productId = ?`,
    vals,
  )

  const [updated] = await query(
    `SELECT si.*, p.name AS productName, p.sku AS productSku
     FROM StocktakeItem si
     JOIN Product p ON p.id = si.productId
     WHERE si.stocktakeId = ? AND si.productId = ?`,
    [id, b.productId],
  )

  return NextResponse.json(updated)
}
