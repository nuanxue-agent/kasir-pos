import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

async function ensureTables() {
  await exec(`CREATE TABLE IF NOT EXISTS WasteLog (
    id          TEXT PRIMARY KEY,
    storeId     TEXT NOT NULL,
    productId   TEXT NOT NULL,
    productName TEXT NOT NULL,
    qty         REAL NOT NULL DEFAULT 0,
    reason      TEXT NOT NULL DEFAULT 'OTHER',
    cost        REAL NOT NULL DEFAULT 0,
    recordedBy  TEXT NOT NULL,
    recordedAt  TEXT NOT NULL,
    notes       TEXT
  )`)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  const since = req.nextUrl.searchParams.get('since') // ISO date string, optional

  await ensureTables()

  const dateClause = since ? `AND recordedAt >= '${since}'` : ''

  const [totalRows, byReasonRows, byEmployeeRows, monthlyRows] = await Promise.all([
    query(
      `SELECT COALESCE(SUM(cost), 0) as totalCost, COALESCE(SUM(qty), 0) as totalQty, COUNT(*) as count
       FROM WasteLog WHERE storeId = ? ${dateClause}`,
      [storeId]
    ),
    query(
      `SELECT reason, COALESCE(SUM(cost), 0) as cost, COALESCE(SUM(qty), 0) as qty, COUNT(*) as count
       FROM WasteLog WHERE storeId = ? ${dateClause}
       GROUP BY reason ORDER BY cost DESC`,
      [storeId]
    ),
    query(
      `SELECT recordedBy, COALESCE(SUM(cost), 0) as cost, COALESCE(SUM(qty), 0) as qty, COUNT(*) as count
       FROM WasteLog WHERE storeId = ? ${dateClause}
       GROUP BY recordedBy ORDER BY cost DESC`,
      [storeId]
    ),
    query(
      `SELECT strftime('%Y-%m', recordedAt) as month,
              COALESCE(SUM(cost), 0) as cost,
              COALESCE(SUM(qty), 0) as qty
       FROM WasteLog WHERE storeId = ?
       GROUP BY strftime('%Y-%m', recordedAt)
       ORDER BY month ASC
       LIMIT 12`,
      [storeId]
    ),
  ])

  const total = totalRows[0] as any

  return NextResponse.json({
    totalCost: Number(total?.totalCost ?? 0),
    totalQty: Number(total?.totalQty ?? 0),
    count: Number(total?.count ?? 0),
    byReason: (byReasonRows as any[]).map(row => ({
      reason: row.reason,
      cost: Number(row.cost),
      qty: Number(row.qty),
      count: Number(row.count),
    })),
    byEmployee: (byEmployeeRows as any[]).map(row => ({
      recordedBy: row.recordedBy,
      cost: Number(row.cost),
      qty: Number(row.qty),
      count: Number(row.count),
    })),
    monthlyTrends: (monthlyRows as any[]).map(row => ({
      month: row.month,
      cost: Number(row.cost),
      qty: Number(row.qty),
    })),
  })
}
