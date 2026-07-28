import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

async function ensureTable() {
  await exec(`CREATE TABLE IF NOT EXISTS InventoryWriteOff (
    id          TEXT PRIMARY KEY,
    storeId     TEXT NOT NULL,
    productId   TEXT NOT NULL,
    productName TEXT NOT NULL,
    qty         REAL NOT NULL DEFAULT 0,
    reason      TEXT NOT NULL DEFAULT 'OTHER',
    costValue   REAL NOT NULL DEFAULT 0,
    approvedBy  TEXT,
    approvedAt  TEXT,
    status      TEXT NOT NULL DEFAULT 'PENDING',
    notes       TEXT,
    createdAt   TEXT NOT NULL,
    createdBy   TEXT NOT NULL
  )`)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureTable()

  const from = req.nextUrl.searchParams.get('from')
  const to = req.nextUrl.searchParams.get('to')

  let sql = `
    SELECT
      reason,
      COUNT(*) as count,
      SUM(qty) as totalQty,
      SUM(costValue) as totalValue
    FROM InventoryWriteOff
    WHERE storeId = ? AND status = 'APPROVED'
  `
  const params: any[] = [storeId]

  if (from) { sql += ` AND createdAt >= ?`; params.push(from) }
  if (to)   { sql += ` AND createdAt <= ?`; params.push(to) }

  sql += ` GROUP BY reason ORDER BY totalValue DESC`

  const byReason = await query(sql, params)

  const totalRows = await query(
    `SELECT COUNT(*) as count, SUM(costValue) as totalValue, SUM(qty) as totalQty
     FROM InventoryWriteOff
     WHERE storeId = ? AND status = 'APPROVED'`,
    [storeId]
  )
  const totals = (totalRows[0] as any) ?? { count: 0, totalValue: 0, totalQty: 0 }

  return NextResponse.json({ byReason, totals })
}
