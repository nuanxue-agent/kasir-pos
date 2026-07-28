// POST /api/replenishment-suggestions/generate?storeId=
// Scans all active ReplenishmentConfigs for the store, calculates velocity
// from SaleItem/OrderItem data over last 30 days, and creates PENDING suggestions.
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import { ensureReplenishmentTables } from '../../replenishment-configs/route'
import {
  calcSalesVelocity,
  calcDaysOfStock,
  isReorderPointBreached,
  calcSuggestedQty,
  classifyUrgency,
  calcExpectedStockout,
} from '@/lib/replenishment'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureReplenishmentTables()

  // Load all active configs with current product stock
  const configs = (await query(`
    SELECT rc.*, p.stock AS currentStock
    FROM ReplenishmentConfig rc
    LEFT JOIN Product p ON rc.productId = p.id
    WHERE rc.storeId = ? AND rc.active = 1
  `, [storeId])) as any[]

  if (configs.length === 0) {
    return NextResponse.json({ created: 0, skipped: 0 })
  }

  // Compute date window: last 30 days
  const now = new Date()
  const since = new Date(now)
  since.setDate(since.getDate() - 30)
  const sinceISO = since.toISOString().slice(0, 10)

  // Dismiss existing PENDING suggestions so we get a fresh set
  await exec(
    `UPDATE ReplenishmentSuggestion SET status = 'DISMISSED'
     WHERE storeId = ? AND status = 'PENDING'`,
    [storeId]
  )

  let created = 0
  let skipped = 0
  const t = nowISO()

  for (const cfg of configs) {
    const currentStock: number = cfg.currentStock ?? 0

    // Only generate suggestions for products at or below reorder point
    if (!isReorderPointBreached(currentStock, cfg.reorderPoint)) {
      skipped++
      continue
    }

    // Fetch daily sales aggregated over the 30-day window
    // Try SaleItem first (POS transactions), fall back to OrderItem (B2B orders)
    let salesRows: any[] = []
    try {
      salesRows = (await query(`
        SELECT
          strftime('%Y-%m-%d', s.createdAt) AS date,
          SUM(si.qty) AS qty
        FROM SaleItem si
        JOIN Sale s ON si.saleId = s.id
        WHERE si.productId = ?
          AND s.storeId   = ?
          AND date(s.createdAt) >= ?
        GROUP BY date(s.createdAt)
      `, [cfg.productId, storeId, sinceISO])) as any[]
    } catch {
      salesRows = []
    }

    // Also try OrderItem if available (may not exist in all stores)
    let orderRows: any[] = []
    try {
      orderRows = (await query(`
        SELECT
          strftime('%Y-%m-%d', o.createdAt) AS date,
          SUM(oi.qty) AS qty
        FROM OrderItem oi
        JOIN \`Order\` o ON oi.orderId = o.id
        WHERE oi.productId = ?
          AND o.storeId   = ?
          AND date(o.createdAt) >= ?
          AND o.status NOT IN ('CANCELLED', 'DRAFT')
        GROUP BY date(o.createdAt)
      `, [cfg.productId, storeId, sinceISO])) as any[]
    } catch {
      orderRows = []
    }

    // Merge both sources by date
    const byDate: Record<string, number> = {}
    for (const row of [...salesRows, ...orderRows]) {
      byDate[row.date] = (byDate[row.date] ?? 0) + Number(row.qty)
    }
    const salesData = Object.entries(byDate).map(([date, qty]) => ({ date, qty }))

    const velocity    = calcSalesVelocity(salesData, 30)
    const daysOfStock = calcDaysOfStock(currentStock, velocity)
    const urgency     = classifyUrgency(daysOfStock, cfg.leadTimeDays)
    const suggestedQty = calcSuggestedQty(
      currentStock,
      velocity,
      cfg.leadTimeDays,
      cfg.safetyStock,
      cfg.maxStock > 0 ? cfg.maxStock : null
    )

    // Skip if nothing to order
    if (suggestedQty <= 0) { skipped++; continue }

    const expectedStockout = calcExpectedStockout(daysOfStock)

    await exec(
      `INSERT INTO ReplenishmentSuggestion
         (id, storeId, productId, vendorId, suggestedQty, urgency, currentStock, expectedStockout, createdAt, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newId(), storeId, cfg.productId,
        cfg.vendorId ?? null,
        suggestedQty, urgency, currentStock,
        expectedStockout, t, 'PENDING',
      ]
    )
    created++
  }

  return NextResponse.json({ created, skipped })
}
