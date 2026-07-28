// GET/POST /api/goods-receipts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

export type ReceiptStatus = 'PENDING' | 'INSPECTING' | 'ACCEPTED' | 'REJECTED' | 'PARTIAL'

export async function ensureGoodsReceiptTables() {
  await exec(`CREATE TABLE IF NOT EXISTS GoodsReceipt (
    id              TEXT PRIMARY KEY,
    storeId         TEXT NOT NULL,
    purchaseOrderId TEXT,
    receivedBy      TEXT NOT NULL,
    receivedAt      TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'PENDING',
    notes           TEXT,
    createdAt       TEXT NOT NULL,
    updatedAt       TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS GoodsReceiptItem (
    id              TEXT PRIMARY KEY,
    receiptId       TEXT NOT NULL,
    storeId         TEXT NOT NULL,
    productId       TEXT NOT NULL,
    orderedQty      REAL NOT NULL DEFAULT 0,
    receivedQty     REAL NOT NULL DEFAULT 0,
    acceptedQty     REAL NOT NULL DEFAULT 0,
    rejectedQty     REAL NOT NULL DEFAULT 0,
    unitCost        REAL NOT NULL DEFAULT 0,
    rejectionReason TEXT,
    inspectionNotes TEXT,
    createdAt       TEXT NOT NULL,
    updatedAt       TEXT NOT NULL
  )`)
}

// GET /api/goods-receipts?storeId=&status=&purchaseOrderId=
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const url = new URL(req.url)
    const storeId = url.searchParams.get('storeId')
    if (!storeId) return err('storeId required')

    const hasAccess = user.stores?.some((s: { id: string }) => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    await ensureGoodsReceiptTables()

    const status = url.searchParams.get('status')
    const purchaseOrderId = url.searchParams.get('purchaseOrderId')

    let sql = `SELECT * FROM GoodsReceipt WHERE storeId = ?`
    const params: unknown[] = [storeId]

    if (status) { sql += ` AND status = ?`; params.push(status) }
    if (purchaseOrderId) { sql += ` AND purchaseOrderId = ?`; params.push(purchaseOrderId) }
    sql += ` ORDER BY createdAt DESC`

    const receipts = await query(sql, params) as any[]

    // Attach item counts
    const enriched = await Promise.all(
      receipts.map(async (r) => {
        const items = await query(
          `SELECT COUNT(*) as cnt, COALESCE(SUM(acceptedQty),0) as totalAccepted,
                  COALESCE(SUM(rejectedQty),0) as totalRejected
           FROM GoodsReceiptItem WHERE receiptId = ?`,
          [r.id]
        ) as any[]
        const s = items[0] ?? {}
        return {
          ...r,
          itemCount: s.cnt ?? 0,
          totalAccepted: s.totalAccepted ?? 0,
          totalRejected: s.totalRejected ?? 0,
        }
      })
    )

    return ok(enriched)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}

// POST /api/goods-receipts?storeId=
// Body: { purchaseOrderId?, receivedBy, notes?, items: [{productId, orderedQty, receivedQty, unitCost?, inspectionNotes?}] }
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const url = new URL(req.url)
    const storeId = url.searchParams.get('storeId')
    if (!storeId) return err('storeId required')

    const hasAccess = user.stores?.some((s: { id: string }) => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    await ensureGoodsReceiptTables()

    const b = (await req.json()) as any
    if (!b.receivedBy) return err("Field 'receivedBy' is required")
    if (!Array.isArray(b.items) || b.items.length === 0) return err('At least one item required')

    // Validate items
    for (const item of b.items) {
      if (!item.productId) return err('Each item must have productId')
      if (item.receivedQty == null || item.receivedQty < 0) return err('receivedQty must be >= 0')
    }
    const hasPositive = b.items.some((i: any) => i.receivedQty > 0)
    if (!hasPositive) return err('At least one item must have receivedQty > 0')

    const t = nowISO()
    const id = newId()

    await exec(
      `INSERT INTO GoodsReceipt (id, storeId, purchaseOrderId, receivedBy, receivedAt, status, notes, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)`,
      [id, storeId, b.purchaseOrderId ?? null, b.receivedBy, t, b.notes ?? null, t, t]
    )

    for (const item of b.items) {
      const itemId = newId()
      await exec(
        `INSERT INTO GoodsReceiptItem (id, receiptId, storeId, productId, orderedQty, receivedQty, acceptedQty, rejectedQty, unitCost, rejectionReason, inspectionNotes, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, NULL, ?, ?, ?)`,
        [
          itemId, id, storeId, item.productId,
          item.orderedQty ?? 0, item.receivedQty,
          item.unitCost ?? 0, item.inspectionNotes ?? null, t, t,
        ]
      )
    }

    return ok({ id }, 201)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
