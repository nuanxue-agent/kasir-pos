// GET /api/stock-age/slow-movers?storeId=&threshold=&limit=
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'
import {
  calcAgeDays,
  calcTurnoverRate,
  calcAgingValue,
  calcAlertLevel,
  isSlowMover,
} from '@/components/inventory/StockAgeClient'
import { ensureStockAgeTable } from '../route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId   = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  const threshold = parseFloat(req.nextUrl.searchParams.get('threshold') ?? '0.5')
  const limit     = parseInt(req.nextUrl.searchParams.get('limit') ?? '100', 10)

  await ensureStockAgeTable()

  // Stock age records joined with product info
  const stockRows = await query(`
    SELECT
      sa.productId,
      sa.qty,
      sa.cost,
      sa.receivedAt,
      p.name AS productName,
      p.sku  AS sku
    FROM StockAge sa
    LEFT JOIN Product p ON sa.productId = p.id
    WHERE sa.storeId = ? AND sa.qty > 0
    ORDER BY sa.productId, sa.receivedAt ASC
  `, [storeId]) as any[]

  // Sales last 30 days per product
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const salesRows = await query(`
    SELECT
      oi.productId,
      COALESCE(SUM(oi.qty), 0) AS unitsSold30d
    FROM OrderItem oi
    JOIN Orders o ON oi.orderId = o.id
    WHERE o.storeId = ?
      AND o.status = 'completed'
      AND o.createdAt >= ?
    GROUP BY oi.productId
  `, [storeId, thirtyDaysAgo.toISOString()]) as any[]

  const salesMap = new Map<string, number>()
  for (const s of salesRows) {
    salesMap.set(s.productId, Number(s.unitsSold30d))
  }

  // Aggregate per product
  const productMap = new Map<string, {
    productId: string
    productName: string
    sku: string | null
    totalQty: number
    totalValue: number
    totalAgeDays: number
    batchCount: number
  }>()

  const now = new Date()

  for (const row of stockRows) {
    const ageDays    = calcAgeDays(row.receivedAt, now)
    const agingValue = calcAgingValue(Number(row.qty), Number(row.cost))
    const existing   = productMap.get(row.productId)

    if (existing) {
      existing.totalQty     += Number(row.qty)
      existing.totalValue   += agingValue
      existing.totalAgeDays += ageDays * Number(row.qty)  // weighted by qty
      existing.batchCount   += 1
    } else {
      productMap.set(row.productId, {
        productId:   row.productId,
        productName: row.productName ?? row.productId,
        sku:         row.sku ?? null,
        totalQty:    Number(row.qty),
        totalValue:  agingValue,
        totalAgeDays: ageDays * Number(row.qty),
        batchCount:  1,
      })
    }
  }

  const results: any[] = []

  for (const [productId, agg] of productMap) {
    const unitsSold30d  = salesMap.get(productId) ?? 0
    const turnoverRate  = calcTurnoverRate(unitsSold30d, agg.totalQty)
    const avgAgeDays    = agg.totalQty > 0 ? agg.totalAgeDays / agg.totalQty : 0

    if (!isSlowMover(turnoverRate, threshold)) continue

    const alertLevel = calcAlertLevel(turnoverRate, avgAgeDays)

    results.push({
      productId,
      productName:   agg.productName,
      sku:           agg.sku,
      currentStock:  agg.totalQty,
      unitsSold30d,
      turnoverRate,
      avgAgeDays,
      agingValue:    agg.totalValue,
      alertLevel,
    })
  }

  // Sort: HIGH alert first, then by aging value desc
  results.sort((a, b) => {
    const alertOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 }
    const levelDiff = alertOrder[a.alertLevel as keyof typeof alertOrder] - alertOrder[b.alertLevel as keyof typeof alertOrder]
    if (levelDiff !== 0) return levelDiff
    return b.agingValue - a.agingValue
  })

  return NextResponse.json(results.slice(0, limit))
}
