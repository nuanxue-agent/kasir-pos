import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function ensurePOTables() {
  await exec(`CREATE TABLE IF NOT EXISTS PurchaseOrder (
    id           TEXT PRIMARY KEY,
    storeId      TEXT NOT NULL,
    vendorId     TEXT NOT NULL,
    poNumber     TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'DRAFT',
    orderDate    TEXT NOT NULL,
    expectedDate TEXT,
    subtotal     REAL NOT NULL DEFAULT 0,
    taxAmount    REAL NOT NULL DEFAULT 0,
    total        REAL NOT NULL DEFAULT 0,
    notes        TEXT,
    createdAt    TEXT NOT NULL,
    updatedAt    TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS PurchaseOrderItem (
    id          TEXT PRIMARY KEY,
    poId        TEXT NOT NULL,
    storeId     TEXT NOT NULL,
    productId   TEXT NOT NULL,
    qty         REAL NOT NULL DEFAULT 1,
    unitPrice   REAL NOT NULL DEFAULT 0,
    total       REAL NOT NULL DEFAULT 0,
    receivedQty REAL NOT NULL DEFAULT 0
  )`)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensurePOTables()

  const status = req.nextUrl.searchParams.get('status')
  const vendorId = req.nextUrl.searchParams.get('vendorId')

  let sql = `SELECT po.*, v.name as vendorName
    FROM PurchaseOrder po
    LEFT JOIN Vendor v ON po.vendorId = v.id
    WHERE po.storeId = ?`
  const params: any[] = [storeId]

  if (status) { sql += ` AND po.status = ?`; params.push(status) }
  if (vendorId) { sql += ` AND po.vendorId = ?`; params.push(vendorId) }
  sql += ` ORDER BY po.createdAt DESC`

  const rows = await query(sql, params).catch(async () => {
    // Vendor table might not exist yet — fallback without join
    let sql2 = `SELECT * FROM PurchaseOrder WHERE storeId = ?`
    const p2: any[] = [storeId]
    if (status) { sql2 += ` AND status = ?`; p2.push(status) }
    if (vendorId) { sql2 += ` AND vendorId = ?`; p2.push(vendorId) }
    sql2 += ` ORDER BY createdAt DESC`
    return query(sql2, p2)
  })

  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensurePOTables()

  const b = (await req.json()) as any
  if (!b.vendorId) return err("vendorId required", 400, 'MISSING_FIELD')

  // Generate PO number: PO-YYYY-NNNN scoped to store + year
  const year = new Date().getUTCFullYear()
  const lastRows = await query(
    `SELECT poNumber FROM PurchaseOrder WHERE storeId = ? AND poNumber LIKE ? ORDER BY poNumber DESC LIMIT 1`,
    [storeId, `PO-${year}-%`]
  ) as any[]
  let seq = 1
  if (lastRows.length > 0) {
    const m = (lastRows[0].poNumber as string).match(/PO-\d{4}-(\d+)/)
    if (m) seq = parseInt(m[1], 10) + 1
  }
  const poNumber = b.poNumber ?? `PO-${year}-${String(seq).padStart(4, '0')}`

  const t = nowISO()
  const id = newId()
  const orderDate = b.orderDate ?? t
  const subtotal = Number(b.subtotal ?? 0)
  const taxAmount = Number(b.taxAmount ?? 0)
  const total = Number(b.total ?? subtotal + taxAmount)

  await exec(
    `INSERT INTO PurchaseOrder (id, storeId, vendorId, poNumber, status, orderDate, expectedDate, subtotal, taxAmount, total, notes, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, storeId, b.vendorId, poNumber, 'DRAFT', orderDate, b.expectedDate ?? null,
     subtotal, taxAmount, total, b.notes ?? null, t, t]
  )

  // Insert items if provided
  if (Array.isArray(b.items) && b.items.length > 0) {
    for (const item of b.items) {
      const itemId = newId()
      const itemTotal = Number(item.qty ?? 1) * Number(item.unitPrice ?? 0)
      await exec(
        `INSERT INTO PurchaseOrderItem (id, poId, storeId, productId, qty, unitPrice, total, receivedQty)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
        [itemId, id, storeId, item.productId, Number(item.qty ?? 1), Number(item.unitPrice ?? 0), itemTotal]
      )
    }
  }

  return NextResponse.json({ id, poNumber }, { status: 201 })
}
