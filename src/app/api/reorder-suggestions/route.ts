// GET /api/reorder-suggestions?storeId=&status=
// POST /api/reorder-suggestions?storeId=  (manual create)
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import { ensureReorderTables as ensureTables } from '../reorder-rules/route'

// Re-export for child routes
export { ensureReorderTables } from '../reorder-rules/route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

// ── Pure business logic (exported for unit tests) ──────────────────────────────

export type SuggestionStatus = 'PENDING' | 'APPROVED' | 'ORDERED' | 'DISMISSED'

const VALID_TRANSITIONS: Record<SuggestionStatus, SuggestionStatus[]> = {
  PENDING:   ['APPROVED', 'DISMISSED'],
  APPROVED:  ['ORDERED', 'DISMISSED'],
  ORDERED:   [],
  DISMISSED: [],
}

export function isValidSuggestionTransition(from: SuggestionStatus, to: SuggestionStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}

/**
 * Returns true when currentStock has fallen at or below the reorder point.
 */
export function shouldTriggerReorder(currentStock: number, reorderPoint: number): boolean {
  return currentStock <= reorderPoint
}

/**
 * Calculate suggested order quantity.
 * If the rule has a reorderQty, use it directly.
 * Otherwise default to reorderQty itself (caller must supply > 0).
 */
export function calcSuggestedQty(reorderQty: number): number {
  return Math.max(0, reorderQty)
}

/**
 * Estimate the earliest delivery date given a lead time in days.
 */
export function calcExpectedDelivery(leadTimeDays: number, from = new Date()): Date {
  const d = new Date(from)
  d.setDate(d.getDate() + Math.max(0, leadTimeDays))
  return d
}

/**
 * Build a minimal purchase-order payload from an approved suggestion + rule.
 */
export function buildPOFromSuggestion(
  suggestion: {
    id: string
    storeId: string
    productId: string
    suggestedQty: number
  },
  rule: {
    preferredVendorId: string | null
    leadTimeDays: number
  },
  now = new Date(),
) {
  return {
    storeId: suggestion.storeId,
    vendorId: rule.preferredVendorId,
    suggestionId: suggestion.id,
    items: [{ productId: suggestion.productId, qty: suggestion.suggestedQty }],
    expectedDelivery: calcExpectedDelivery(rule.leadTimeDays, now).toISOString(),
    status: 'DRAFT',
    notes: `Auto-generated from reorder suggestion ${suggestion.id}`,
  }
}

// ── Route handlers ──────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  const statusFilter = req.nextUrl.searchParams.get('status')

  await ensureTables()

  const conditions: string[] = ['rs.storeId = ?']
  const params: any[] = [storeId]

  if (statusFilter) {
    conditions.push('rs.status = ?')
    params.push(statusFilter)
  }

  const rows = await query(`
    SELECT
      rs.*,
      p.name AS productName,
      p.sku  AS sku,
      p.unit AS unit,
      rr.reorderQty,
      rr.leadTimeDays,
      rr.preferredVendorId,
      v.name AS vendorName
    FROM ReorderSuggestion rs
    LEFT JOIN Product p ON rs.productId = p.id
    LEFT JOIN ReorderRule rr ON rr.storeId = rs.storeId AND rr.productId = rs.productId
    LEFT JOIN Vendor v ON rr.preferredVendorId = v.id
    WHERE ${conditions.join(' AND ')}
    ORDER BY rs.createdAt DESC
  `, params)

  return NextResponse.json(rows as any[])
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureTables()

  const b = (await req.json()) as any
  if (!b.productId) return err("Field 'productId' is required", 400, 'MISSING_FIELD')
  if (b.currentStock === undefined) return err("Field 'currentStock' is required", 400, 'MISSING_FIELD')
  if (b.reorderPoint === undefined) return err("Field 'reorderPoint' is required", 400, 'MISSING_FIELD')
  if (b.suggestedQty === undefined) return err("Field 'suggestedQty' is required", 400, 'MISSING_FIELD')

  const t = nowISO()
  const id = newId()

  await exec(
    `INSERT INTO ReorderSuggestion (id, storeId, productId, currentStock, reorderPoint, suggestedQty, status, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)`,
    [id, storeId, b.productId, b.currentStock, b.reorderPoint, b.suggestedQty, t, t]
  )

  return NextResponse.json({ id }, { status: 201 })
}
