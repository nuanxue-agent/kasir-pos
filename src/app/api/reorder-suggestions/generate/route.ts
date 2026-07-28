// POST /api/reorder-suggestions/generate?storeId=
// Scans all active ReorderRules, checks current stock, creates PENDING suggestions
// for any product at or below its reorder point (skips if PENDING already exists).
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import { ensureReorderTables } from '../route'
import { shouldTriggerReorder, calcSuggestedQty } from '../route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureReorderTables()

  // Fetch all active reorder rules with current product stock
  const rules = await query(`
    SELECT
      rr.id AS ruleId,
      rr.productId,
      rr.reorderPoint,
      rr.reorderQty,
      rr.leadTimeDays,
      rr.preferredVendorId,
      COALESCE(p.stock, 0) AS currentStock
    FROM ReorderRule rr
    LEFT JOIN Product p ON rr.productId = p.id
    WHERE rr.storeId = ? AND rr.active = 1
  `, [storeId])

  // Fetch existing PENDING suggestions to avoid duplicates
  const pendingRows = await query(
    `SELECT productId FROM ReorderSuggestion WHERE storeId = ? AND status = 'PENDING'`,
    [storeId]
  )
  const pendingProductIds = new Set((pendingRows as any[]).map(r => r.productId))

  const created: string[] = []
  const skipped: string[] = []

  for (const rule of rules as any[]) {
    const currentStock = rule.currentStock as number
    const reorderPoint = rule.reorderPoint as number

    if (!shouldTriggerReorder(currentStock, reorderPoint)) {
      skipped.push(rule.productId)
      continue
    }

    // Skip if a PENDING suggestion already exists for this product
    if (pendingProductIds.has(rule.productId)) {
      skipped.push(rule.productId)
      continue
    }

    const suggestedQty = calcSuggestedQty(rule.reorderQty)
    const t = nowISO()
    const id = newId()

    await exec(
      `INSERT INTO ReorderSuggestion (id, storeId, productId, currentStock, reorderPoint, suggestedQty, status, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)`,
      [id, storeId, rule.productId, currentStock, reorderPoint, suggestedQty, t, t]
    )

    created.push(id)
  }

  return NextResponse.json({
    created: created.length,
    skipped: skipped.length,
    suggestionIds: created,
  })
}
