// GET  /api/points-transfers/limits?storeId=&customerId=
// Returns daily limit config + how many points the customer has already sent today
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

async function ensureConfigTable() {
  await exec(`
    CREATE TABLE IF NOT EXISTS PointsTransferConfig (
      id                TEXT PRIMARY KEY DEFAULT 'default',
      storeId           TEXT NOT NULL UNIQUE,
      dailyLimitPoints  INTEGER NOT NULL DEFAULT 10000,
      minTransferPoints INTEGER NOT NULL DEFAULT 10,
      updatedAt         TEXT NOT NULL
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

  await ensureConfigTable()

  // Load or default config
  const cfgRows = await query(
    `SELECT dailyLimitPoints, minTransferPoints FROM PointsTransferConfig WHERE storeId=? LIMIT 1`,
    [storeId],
  )
  const cfg = (cfgRows as any[])[0] ?? { dailyLimitPoints: 10000, minTransferPoints: 10 }

  let usedTodayPoints = 0
  if (customerId) {
    const today = nowISO().slice(0, 10)
    const usedRows = await query(
      `SELECT COALESCE(SUM(points),0) AS used FROM PointsTransfer
       WHERE storeId=? AND fromCustomerId=? AND status != 'CANCELLED'
         AND createdAt >= ?`,
      [storeId, customerId, today + 'T00:00:00.000Z'],
    ).catch(() => [])
    usedTodayPoints = Number((usedRows as any[])[0]?.used ?? 0)
  }

  return NextResponse.json({
    dailyLimitPoints: cfg.dailyLimitPoints,
    minTransferPoints: cfg.minTransferPoints,
    usedTodayPoints,
  })
}
