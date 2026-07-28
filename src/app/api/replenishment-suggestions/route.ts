// GET /api/replenishment-suggestions?storeId=&status=
// POST /api/replenishment-suggestions?storeId=  (manual create)
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import { ensureReplenishmentTables } from '../replenishment-configs/route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  const statusFilter = req.nextUrl.searchParams.get('status')

  await ensureReplenishmentTables()

  const conditions: string[] = ['rs.storeId = ?']
  const params: any[] = [storeId]

  if (statusFilter) {
    conditions.push('rs.status = ?')
    params.push(statusFilter)
  } else {
    conditions.push("rs.status = 'PENDING'")
  }

  const rows = await query(`
    SELECT
      rs.*,
      p.name AS productName,
      p.sku  AS sku,
      v.name AS vendorName
    FROM ReplenishmentSuggestion rs
    LEFT JOIN Product p ON rs.productId = p.id
    LEFT JOIN Vendor  v ON rs.vendorId   = v.id
    WHERE ${conditions.join(' AND ')}
    ORDER BY
      CASE rs.urgency
        WHEN 'CRITICAL' THEN 1
        WHEN 'HIGH'     THEN 2
        WHEN 'MEDIUM'   THEN 3
        ELSE 4
      END ASC,
      rs.createdAt DESC
  `, params)

  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureReplenishmentTables()

  const b = (await req.json()) as any
  if (!b.productId)          return err("Field 'productId' is required",    400, 'MISSING_FIELD')
  if (b.suggestedQty === undefined) return err("Field 'suggestedQty' is required", 400, 'MISSING_FIELD')
  if (!b.urgency)            return err("Field 'urgency' is required",      400, 'MISSING_FIELD')
  if (b.currentStock === undefined) return err("Field 'currentStock' is required", 400, 'MISSING_FIELD')

  const validUrgency = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
  if (!validUrgency.includes(b.urgency)) return err('Invalid urgency value', 400, 'INVALID_VALUE')

  const id = newId()
  const t  = nowISO()

  await exec(
    `INSERT INTO ReplenishmentSuggestion
       (id, storeId, productId, vendorId, suggestedQty, urgency, currentStock, expectedStockout, createdAt, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, storeId, b.productId,
      b.vendorId ?? null,
      b.suggestedQty, b.urgency, b.currentStock,
      b.expectedStockout ?? null,
      t, 'PENDING',
    ]
  )

  return NextResponse.json({ id }, { status: 201 })
}
