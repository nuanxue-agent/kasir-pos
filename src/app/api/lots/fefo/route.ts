// GET /api/lots/fefo?storeId=&productId=&qty=
// Returns FEFO-ordered lots for picking; optionally builds a pick plan if qty provided
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'
import { fefoSort, buildFefoPickPlan, daysUntilExpiry } from '@/lib/lot-tracking'
import type { Lot } from '@/lib/lot-tracking'
import { ensureLotTable } from '../route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId   = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  const productId = req.nextUrl.searchParams.get('productId')
  const qtyParam  = req.nextUrl.searchParams.get('qty')

  if (!storeId)   return err('storeId required', 400, 'MISSING_FIELD')
  if (!productId) return err('productId required', 400, 'MISSING_FIELD')

  await ensureLotTable()

  const rows = await query(`
    SELECT
      l.id, l.storeId, l.productId, l.lotNumber,
      l.expiryDate, l.receivedDate, l.initialQty, l.remainingQty,
      l.supplierId, l.costPerUnit, l.status,
      l.createdAt, l.updatedAt,
      p.name AS productName
    FROM Lot l
    LEFT JOIN Product p ON p.id = l.productId
    WHERE l.storeId = ? AND l.productId = ? AND l.status = 'ACTIVE' AND l.remainingQty > 0
    ORDER BY l.expiryDate ASC, l.receivedDate ASC
  `, [storeId, productId])

  const lots = rows as Lot[]
  const now  = new Date()
  const sorted = fefoSort(lots, now)

  if (qtyParam) {
    const qty = parseFloat(qtyParam)
    if (isNaN(qty) || qty <= 0) return err("'qty' must be a positive number", 400, 'INVALID_FIELD')
    const plan = buildFefoPickPlan(lots, qty, now)
    const totalAvailable = sorted.reduce((s, l) => s + l.remainingQty, 0)
    return NextResponse.json({
      productId,
      requestedQty: qty,
      totalAvailable,
      fulfillable: plan.reduce((s, p) => s + p.pickQty, 0) >= qty,
      plan: plan.map(p => ({
        ...p.lot,
        daysUntilExpiry: daysUntilExpiry(p.lot.expiryDate, now),
        pickQty: p.pickQty,
      })),
    })
  }

  return NextResponse.json(
    sorted.map(l => ({
      ...l,
      daysUntilExpiry: daysUntilExpiry(l.expiryDate, now),
    }))
  )
}
