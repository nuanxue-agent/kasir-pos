// GET /api/warehouses?storeId=
// POST /api/warehouses
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

  const warehouses = (await query(
    `SELECT * FROM Warehouse WHERE storeId = ? ORDER BY name ASC`,
    [storeId],
  )) as any[]
  return NextResponse.json({ warehouses })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureTables()

  const b = (await req.json()) as Record<string, any>
  if (!b.name || !b.name.trim()) return err("Field 'name' is required", 400, 'MISSING_FIELD')
  if (b.type && !['MAIN', 'SATELLITE', 'TRANSIT'].includes(b.type))
    return err("type must be MAIN, SATELLITE, or TRANSIT", 400, 'INVALID_VALUE')

  const id = newId()
  await exec(
    `INSERT INTO Warehouse (id, storeId, name, address, type, active, createdAt)
     VALUES (?, ?, ?, ?, ?, 1, ?)`,
    [id, storeId, b.name.trim(), b.address ?? null, b.type ?? 'MAIN', nowISO()],
  )
  const warehouse = (await query(`SELECT * FROM Warehouse WHERE id = ?`, [id])) as any[]
  return NextResponse.json({ warehouse: warehouse[0] }, { status: 201 })
}
