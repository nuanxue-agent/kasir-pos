// GET  /api/points-transfers?storeId=&customerId=
// POST /api/points-transfers
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

async function ensureTables() {
  await exec(`
    CREATE TABLE IF NOT EXISTS PointsTransfer (
      id               TEXT PRIMARY KEY,
      storeId          TEXT NOT NULL,
      fromCustomerId   TEXT NOT NULL,
      toCustomerId     TEXT NOT NULL,
      points           INTEGER NOT NULL,
      message          TEXT,
      status           TEXT NOT NULL DEFAULT 'PENDING',
      createdAt        TEXT NOT NULL
    )
  `)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  const customerId = req.nextUrl.searchParams.get('customerId')

  await ensureTables()

  let sql: string
  let params: any[]

  if (customerId) {
    sql = `
      SELECT
        pt.*,
        fc.name AS fromCustomerName,
        tc.name AS toCustomerName
      FROM PointsTransfer pt
      LEFT JOIN Customer fc ON fc.id = pt.fromCustomerId
      LEFT JOIN Customer tc ON tc.id = pt.toCustomerId
      WHERE pt.storeId = ?
        AND (pt.fromCustomerId = ? OR pt.toCustomerId = ?)
      ORDER BY pt.createdAt DESC
      LIMIT 200
    `
    params = [storeId, customerId, customerId]
  } else {
    sql = `
      SELECT
        pt.*,
        fc.name AS fromCustomerName,
        tc.name AS toCustomerName
      FROM PointsTransfer pt
      LEFT JOIN Customer fc ON fc.id = pt.fromCustomerId
      LEFT JOIN Customer tc ON tc.id = pt.toCustomerId
      WHERE pt.storeId = ?
      ORDER BY pt.createdAt DESC
      LIMIT 500
    `
    params = [storeId]
  }

  const rows = await query(sql, params)
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  await ensureTables()

  const b = (await req.json()) as any
  const storeId = b.storeId ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  const { fromCustomerId, toCustomerId, points, message } = b

  if (!fromCustomerId) return err("Field 'fromCustomerId' is required", 400, 'MISSING_FIELD')
  if (!toCustomerId)   return err("Field 'toCustomerId' is required",   400, 'MISSING_FIELD')
  if (fromCustomerId === toCustomerId) return err('Sender and recipient must be different', 400, 'INVALID_VALUE')

  const pts = Number(points)
  if (!pts || pts <= 0 || !Number.isInteger(pts)) {
    return err('points must be a positive integer', 400, 'INVALID_VALUE')
  }

  // ── Load config ──
  const limitsRows = await query(
    `SELECT dailyLimitPoints, minTransferPoints FROM PointsTransferConfig WHERE storeId=? LIMIT 1`,
    [storeId],
  ).catch(() => [])
  const cfg = (limitsRows as any[])[0] ?? { dailyLimitPoints: 10000, minTransferPoints: 10 }

  if (pts < cfg.minTransferPoints) {
    return err(`Minimum transfer is ${cfg.minTransferPoints} points`, 400, 'BELOW_MIN')
  }

  // ── Check sender balance ──
  const customerRows = await query(
    `SELECT loyaltyPoints FROM Customer WHERE id=? AND storeId=? LIMIT 1`,
    [fromCustomerId, storeId],
  )
  const customer = (customerRows as any[])[0]
  if (!customer) return err('Sender customer not found', 404, 'NOT_FOUND')
  if ((customer.loyaltyPoints ?? 0) < pts) {
    return err(`Insufficient balance. Available: ${customer.loyaltyPoints ?? 0} points`, 400, 'INSUFFICIENT_BALANCE')
  }

  // ── Check daily limit ──
  const today = nowISO().slice(0, 10)
  const usedRows = await query(
    `SELECT COALESCE(SUM(points),0) AS used FROM PointsTransfer
     WHERE storeId=? AND fromCustomerId=? AND status != 'CANCELLED'
       AND createdAt >= ?`,
    [storeId, fromCustomerId, today + 'T00:00:00.000Z'],
  )
  const usedToday = Number((usedRows as any[])[0]?.used ?? 0)
  if (usedToday + pts > cfg.dailyLimitPoints) {
    return err(
      `Daily limit exceeded. Remaining today: ${cfg.dailyLimitPoints - usedToday} points`,
      400,
      'DAILY_LIMIT_EXCEEDED',
    )
  }

  // ── Verify recipient exists ──
  const recipientRows = await query(
    `SELECT id FROM Customer WHERE id=? AND storeId=? LIMIT 1`,
    [toCustomerId, storeId],
  )
  if (!(recipientRows as any[])[0]) return err('Recipient customer not found', 404, 'NOT_FOUND')

  // ── Execute transfer ──
  const id = newId()
  const now = nowISO()

  await exec(
    `INSERT INTO PointsTransfer (id, storeId, fromCustomerId, toCustomerId, points, message, status, createdAt)
     VALUES (?,?,?,?,?,?,?,?)`,
    [id, storeId, fromCustomerId, toCustomerId, pts, message ?? null, 'COMPLETED', now],
  )

  // Deduct from sender, add to recipient
  await exec(
    `UPDATE Customer SET loyaltyPoints = MAX(0, COALESCE(loyaltyPoints,0) - ?) WHERE id=? AND storeId=?`,
    [pts, fromCustomerId, storeId],
  )
  await exec(
    `UPDATE Customer SET loyaltyPoints = COALESCE(loyaltyPoints,0) + ? WHERE id=? AND storeId=?`,
    [pts, toCustomerId, storeId],
  )

  return NextResponse.json(
    { id, storeId, fromCustomerId, toCustomerId, points: pts, message: message ?? null, status: 'COMPLETED', createdAt: now },
    { status: 201 },
  )
}
