// PATCH /api/reorder-suggestions/[id]  — approve / dismiss / order
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import { ensureReorderTables, isValidSuggestionTransition, buildPOFromSuggestion } from '../route'
import type { SuggestionStatus } from '../route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')

  const { id } = await params
  await ensureReorderTables()

  const b = (await req.json()) as any
  if (!b.status) return err("Field 'status' is required", 400, 'MISSING_FIELD')

  const rows = await query(`SELECT * FROM ReorderSuggestion WHERE id = ?`, [id])
  if (rows.length === 0) return err('Not found', 404, 'NOT_FOUND')
  const suggestion = rows[0] as any

  const newStatus = b.status as SuggestionStatus
  if (!isValidSuggestionTransition(suggestion.status, newStatus)) {
    return err(
      `Cannot transition from ${suggestion.status} to ${newStatus}`,
      400,
      'INVALID_TRANSITION',
    )
  }

  const t = nowISO()
  await exec(
    `UPDATE ReorderSuggestion SET status = ?, updatedAt = ? WHERE id = ?`,
    [newStatus, t, id]
  )

  // Auto-generate PO when moving to ORDERED
  let poPayload: ReturnType<typeof buildPOFromSuggestion> | null = null
  if (newStatus === 'ORDERED') {
    const ruleRows = await query(
      `SELECT * FROM ReorderRule WHERE storeId = ? AND productId = ?`,
      [suggestion.storeId, suggestion.productId]
    )
    const rule = (ruleRows[0] as any) ?? { preferredVendorId: null, leadTimeDays: 0 }
    poPayload = buildPOFromSuggestion(suggestion, rule)

    // Persist to PurchaseOrder table if it exists (best-effort — table may not exist yet)
    await exec(`CREATE TABLE IF NOT EXISTS PurchaseOrder (
      id                TEXT PRIMARY KEY,
      storeId           TEXT NOT NULL,
      vendorId          TEXT,
      suggestionId      TEXT,
      status            TEXT NOT NULL DEFAULT 'DRAFT',
      expectedDelivery  TEXT,
      notes             TEXT,
      createdAt         TEXT NOT NULL,
      updatedAt         TEXT NOT NULL
    )`).catch(() => {/* ignore if already exists */})

    await exec(`CREATE TABLE IF NOT EXISTS PurchaseOrderItem (
      id          TEXT PRIMARY KEY,
      orderId     TEXT NOT NULL,
      productId   TEXT NOT NULL,
      qty         REAL NOT NULL DEFAULT 0,
      unitCost    REAL NOT NULL DEFAULT 0
    )`).catch(() => {/* ignore */})

    const poId = newId()
    await exec(
      `INSERT INTO PurchaseOrder (id, storeId, vendorId, suggestionId, status, expectedDelivery, notes, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        poId,
        poPayload.storeId,
        poPayload.vendorId,
        poPayload.suggestionId,
        poPayload.status,
        poPayload.expectedDelivery,
        poPayload.notes,
        t,
        t,
      ]
    )

    for (const item of poPayload.items) {
      await exec(
        `INSERT INTO PurchaseOrderItem (id, orderId, productId, qty, unitCost) VALUES (?, ?, ?, ?, ?)`,
        [newId(), poId, item.productId, item.qty, 0]
      )
    }

    return NextResponse.json({ ok: true, poId, po: poPayload })
  }

  return NextResponse.json({ ok: true })
}
