// GET /api/stock-transfers?storeId=
// POST /api/stock-transfers
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

async function ensureTables() {
  await exec(`
    CREATE TABLE IF NOT EXISTS Warehouse (
      id        TEXT PRIMARY KEY,
      storeId   TEXT NOT NULL,
      name      TEXT NOT NULL,
      address   TEXT,
      type      TEXT NOT NULL DEFAULT 'MAIN' CHECK(type IN ('MAIN','SATELLITE','TRANSIT')),
      active    INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL
    )
  `)
  await exec(`
    CREATE TABLE IF NOT EXISTS StockTransfer (
      id              TEXT PRIMARY KEY,
      fromWarehouseId TEXT NOT NULL,
      toWarehouseId   TEXT NOT NULL,
      storeId         TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','IN_TRANSIT','RECEIVED','CANCELLED')),
      notes           TEXT,
      createdAt       TEXT NOT NULL
    )
  `)
  await exec(`
    CREATE TABLE IF NOT EXISTS StockTransferItem (
      id          TEXT PRIMARY KEY,
      transferId  TEXT NOT NULL,
      productId   TEXT NOT NULL,
      qty         REAL NOT NULL,
      receivedQty REAL
    )
  `)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const sp = req.nextUrl.searchParams
  const storeId = sp.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureTables()

  const transfers = (await query(
    `SELECT t.*,
            fw.name as fromWarehouseName,
            tw.name as toWarehouseName
       FROM StockTransfer t
       LEFT JOIN Warehouse fw ON t.fromWarehouseId = fw.id
       LEFT JOIN Warehouse tw ON t.toWarehouseId   = tw.id
      WHERE t.storeId = ?
      ORDER BY t.createdAt DESC
      LIMIT 200`,
    [storeId],
  )) as any[]

  // Attach items to each transfer
  const result = await Promise.all(
    transfers.map(async (t) => {
      const items = (await query(
        `SELECT sti.*, p.name as productName, p.sku
           FROM StockTransferItem sti
           LEFT JOIN Product p ON sti.productId = p.id
          WHERE sti.transferId = ?`,
        [t.id],
      )) as any[]
      return { ...t, items }
    }),
  )

  return NextResponse.json({ transfers: result })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureTables()

  const b = (await req.json()) as Record<string, any>

  for (const f of ['fromWarehouseId', 'toWarehouseId', 'items']) {
    if (!b[f]) return err(`Field '${f}' is required`, 400, 'MISSING_FIELD')
  }
  if (b.fromWarehouseId === b.toWarehouseId)
    return err('Source and destination warehouses must differ', 400, 'INVALID_VALUE')
  if (!Array.isArray(b.items) || b.items.length === 0)
    return err('items must be a non-empty array', 400, 'INVALID_VALUE')

  for (const item of b.items) {
    if (!item.productId) return err('Each item requires productId', 400, 'MISSING_FIELD')
    const qty = Number(item.qty)
    if (isNaN(qty) || qty <= 0) return err('Each item qty must be > 0', 400, 'INVALID_VALUE')
  }

  const transferId = newId()
  await exec(
    `INSERT INTO StockTransfer (id, fromWarehouseId, toWarehouseId, storeId, status, notes, createdAt)
     VALUES (?, ?, ?, ?, 'PENDING', ?, ?)`,
    [transferId, b.fromWarehouseId, b.toWarehouseId, storeId, b.notes ?? null, nowISO()],
  )

  for (const item of b.items) {
    await exec(
      `INSERT INTO StockTransferItem (id, transferId, productId, qty, receivedQty)
       VALUES (?, ?, ?, ?, NULL)`,
      [newId(), transferId, item.productId, Number(item.qty)],
    )
  }

  const transfer = (await query(`SELECT * FROM StockTransfer WHERE id = ?`, [transferId])) as any[]
  const items = (await query(`SELECT * FROM StockTransferItem WHERE transferId = ?`, [transferId])) as any[]
  return NextResponse.json({ transfer: { ...transfer[0], items } }, { status: 201 })
}
