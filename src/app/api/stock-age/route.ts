// GET /api/stock-age?storeId=&bucket=&warehouseId=&limit=
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import { calcAgeDays, classifyAgeBucket, calcAgingValue } from '@/components/inventory/StockAgeClient'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function ensureStockAgeTable() {
  await exec(`CREATE TABLE IF NOT EXISTS StockAge (
    id          TEXT PRIMARY KEY,
    storeId     TEXT NOT NULL,
    productId   TEXT NOT NULL,
    warehouseId TEXT,
    batchId     TEXT,
    receivedAt  TEXT NOT NULL,
    qty         REAL NOT NULL DEFAULT 0,
    cost        REAL NOT NULL DEFAULT 0,
    createdAt   TEXT NOT NULL,
    updatedAt   TEXT NOT NULL
  )`)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  const bucketFilter = req.nextUrl.searchParams.get('bucket')
  const warehouseId  = req.nextUrl.searchParams.get('warehouseId')
  const limit        = parseInt(req.nextUrl.searchParams.get('limit') ?? '500', 10)

  await ensureStockAgeTable()

  const conditions: string[] = ['sa.storeId = ?']
  const params: any[] = [storeId]

  if (warehouseId) {
    conditions.push('sa.warehouseId = ?')
    params.push(warehouseId)
  }

  const rows = await query(`
    SELECT
      sa.id,
      sa.storeId,
      sa.productId,
      sa.warehouseId,
      sa.batchId,
      sa.receivedAt,
      sa.qty,
      sa.cost,
      p.name  AS productName,
      p.sku   AS sku,
      w.name  AS warehouseName
    FROM StockAge sa
    LEFT JOIN Product p  ON sa.productId   = p.id
    LEFT JOIN Warehouse w ON sa.warehouseId = w.id
    WHERE ${conditions.join(' AND ')}
    ORDER BY sa.receivedAt ASC
    LIMIT ?
  `, [...params, limit]) as any[]

  const now = new Date()

  const enriched = (rows as any[])
    .map(row => {
      const ageDays    = calcAgeDays(row.receivedAt, now)
      const ageBucket  = classifyAgeBucket(ageDays)
      const agingValue = calcAgingValue(Number(row.qty), Number(row.cost))
      return {
        ...row,
        qty:         Number(row.qty),
        cost:        Number(row.cost),
        ageDays,
        ageBucket,
        agingValue,
      }
    })
    .filter(row => !bucketFilter || row.ageBucket === bucketFilter)

  return NextResponse.json(enriched)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureStockAgeTable()

  const b = (await req.json()) as any
  if (!b.productId)  return err("Field 'productId' is required",  400, 'MISSING_FIELD')
  if (!b.receivedAt) return err("Field 'receivedAt' is required", 400, 'MISSING_FIELD')
  if (b.qty == null) return err("Field 'qty' is required",        400, 'MISSING_FIELD')
  if (b.cost == null) return err("Field 'cost' is required",      400, 'MISSING_FIELD')

  const t  = nowISO()
  const id = newId()

  await exec(`
    INSERT INTO StockAge (id, storeId, productId, warehouseId, batchId, receivedAt, qty, cost, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [id, storeId, b.productId, b.warehouseId ?? null, b.batchId ?? null, b.receivedAt, b.qty, b.cost, t, t])

  return NextResponse.json({ id }, { status: 201 })
}
