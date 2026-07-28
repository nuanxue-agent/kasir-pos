import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import { generateBinCode, calcAvailableSpace, validateTransfer } from '@/lib/bin-locations'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function ensureBinLocationTables() {
  await exec(`CREATE TABLE IF NOT EXISTS BinLocation (
    id          TEXT PRIMARY KEY,
    warehouseId TEXT NOT NULL,
    storeId     TEXT NOT NULL,
    code        TEXT NOT NULL,
    aisle       TEXT NOT NULL,
    rack        TEXT NOT NULL,
    shelf       TEXT NOT NULL,
    bin         TEXT NOT NULL,
    capacity    INTEGER NOT NULL DEFAULT 0,
    currentQty  INTEGER NOT NULL DEFAULT 0,
    active      INTEGER NOT NULL DEFAULT 1,
    createdAt   TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS BinProduct (
    id        TEXT PRIMARY KEY,
    binId     TEXT NOT NULL,
    storeId   TEXT NOT NULL,
    productId TEXT NOT NULL,
    qty       INTEGER NOT NULL DEFAULT 0,
    lotId     TEXT
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS BinTransfer (
    id        TEXT PRIMARY KEY,
    storeId   TEXT NOT NULL,
    fromBinId TEXT NOT NULL,
    toBinId   TEXT NOT NULL,
    productId TEXT NOT NULL,
    qty       INTEGER NOT NULL,
    note      TEXT,
    createdAt TEXT NOT NULL
  )`)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any
  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')
  const warehouseId = req.nextUrl.searchParams.get('warehouseId')

  await ensureBinLocationTables()

  let sql = `SELECT * FROM BinLocation WHERE storeId = ?`
  const params: any[] = [storeId]
  if (warehouseId) {
    sql += ` AND warehouseId = ?`
    params.push(warehouseId)
  }
  sql += ` ORDER BY aisle, rack, shelf, bin`

  const rows = await query(sql, params)
  return NextResponse.json((rows as any[]).map(r => ({ ...r, active: Boolean(r.active) })))
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any
  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  const body = await req.json() as any
  const { warehouseId, aisle, rack, shelf, bin, capacity = 0 } = body
  if (!warehouseId || !aisle || !rack || !shelf || !bin) {
    return err('warehouseId, aisle, rack, shelf, bin required', 400, 'MISSING_FIELD')
  }

  await ensureBinLocationTables()

  const code = generateBinCode(aisle, rack, shelf, bin)
  const id = newId()
  const createdAt = nowISO()

  await exec(
    `INSERT INTO BinLocation (id, warehouseId, storeId, code, aisle, rack, shelf, bin, capacity, currentQty, active, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?)`,
    [id, warehouseId, storeId, code, aisle, rack, shelf, bin, capacity, createdAt],
  )

  const row = await query(`SELECT * FROM BinLocation WHERE id = ?`, [id])
  return NextResponse.json((row as any[])[0], { status: 201 })
}
