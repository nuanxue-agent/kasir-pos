// PATCH /api/stock-transfers/:id  — status update or receive
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

const VALID_STATUSES = ['PENDING', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED']
const VALID_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['IN_TRANSIT', 'CANCELLED'],
  IN_TRANSIT: ['RECEIVED', 'CANCELLED'],
  RECEIVED: [],
  CANCELLED: [],
}

async function ensureTables() {
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
  await exec(`
    CREATE TABLE IF NOT EXISTS WarehouseStock (
      id          TEXT PRIMARY KEY,
      warehouseId TEXT NOT NULL,
      storeId     TEXT NOT NULL,
      productId   TEXT NOT NULL,
      qty         REAL NOT NULL DEFAULT 0,
      minQty      REAL NOT NULL DEFAULT 0,
      updatedAt   TEXT NOT NULL
    )
  `)
}

async function upsertStock(warehouseId: string, storeId: string, productId: string, delta: number) {
  const rows = (await query(
    `SELECT id, qty FROM WarehouseStock WHERE warehouseId = ? AND productId = ?`,
    [warehouseId, productId],
  )) as any[]
  if (rows.length) {
    await exec(
      `UPDATE WarehouseStock SET qty = qty + ?, updatedAt = ? WHERE id = ?`,
      [delta, nowISO(), rows[0].id],
    )
  } else {
    const { newId } = await import('@/lib/db')
    await exec(
      `INSERT INTO WarehouseStock (id, warehouseId, storeId, productId, qty, minQty, updatedAt)
       VALUES (?, ?, ?, ?, ?, 0, ?)`,
      [newId(), warehouseId, storeId, productId, Math.max(0, delta), nowISO()],
    )
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')

  await ensureTables()

  const { id } = await params
  const rows = (await query(`SELECT * FROM StockTransfer WHERE id = ?`, [id])) as any[]
  if (!rows.length) return err('Transfer not found', 404, 'NOT_FOUND')
  const transfer = rows[0]

  const b = (await req.json()) as Record<string, any>

  if (b.status) {
    if (!VALID_STATUSES.includes(b.status))
      return err(`Invalid status '${b.status}'`, 400, 'INVALID_VALUE')

    const allowed = VALID_TRANSITIONS[transfer.status] ?? []
    if (!allowed.includes(b.status))
      return err(
        `Cannot transition from ${transfer.status} to ${b.status}`,
        400,
        'INVALID_TRANSITION',
      )

    // When receiving: record receivedQty per item and update warehouse stock
    if (b.status === 'RECEIVED') {
      const items = (await query(
        `SELECT * FROM StockTransferItem WHERE transferId = ?`,
        [id],
      )) as any[]

      const receivedMap: Record<string, number> = {}
      if (Array.isArray(b.receivedItems)) {
        for (const ri of b.receivedItems) {
          if (ri.itemId && ri.receivedQty !== undefined) {
            receivedMap[ri.itemId] = Number(ri.receivedQty)
          }
        }
      }

      for (const item of items) {
        const received = receivedMap[item.id] ?? item.qty
        await exec(
          `UPDATE StockTransferItem SET receivedQty = ? WHERE id = ?`,
          [received, item.id],
        )
        // Deduct from source warehouse, add to destination
        await upsertStock(transfer.fromWarehouseId, transfer.storeId, item.productId, -item.qty)
        await upsertStock(transfer.toWarehouseId, transfer.storeId, item.productId, received)
      }
    }

    await exec(`UPDATE StockTransfer SET status = ? WHERE id = ?`, [b.status, id])
  }

  const updated = (await query(`SELECT * FROM StockTransfer WHERE id = ?`, [id])) as any[]
  const items = (await query(`SELECT * FROM StockTransferItem WHERE transferId = ?`, [id])) as any[]
  return NextResponse.json({ transfer: { ...updated[0], items } })
}
