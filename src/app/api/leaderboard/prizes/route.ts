import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import { ensureLeaderboardTables } from '../route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureLeaderboardTables()

  const period = req.nextUrl.searchParams.get('period') ?? ''
  const sql = period
    ? `SELECT * FROM LeaderboardPrize WHERE storeId = ? AND period = ? ORDER BY rank ASC`
    : `SELECT * FROM LeaderboardPrize WHERE storeId = ? ORDER BY period, rank ASC`
  const params = period ? [storeId, period] : [storeId]

  const rows = await query(sql, params)
  const prizes = (rows as any[]).map(row => ({
    ...row,
    claimed: Boolean(row.claimed),
  }))

  return NextResponse.json(prizes)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureLeaderboardTables()

  const b = (await req.json()) as any
  if (!b.prize) return err("Field 'prize' is required", 400, 'MISSING_FIELD')
  if (!b.rank) return err("Field 'rank' is required", 400, 'MISSING_FIELD')

  const period = b.period ?? 'MONTHLY'
  const validPeriods = ['WEEKLY', 'MONTHLY', 'ALL_TIME']
  if (!validPeriods.includes(period)) return err('Invalid period', 400, 'INVALID_FIELD')

  // Check for duplicate rank+period
  const existing = await query(
    `SELECT id FROM LeaderboardPrize WHERE storeId = ? AND period = ? AND rank = ?`,
    [storeId, period, b.rank],
  )
  if (existing.length > 0)
    return err('Prize already exists for this rank and period', 400, 'DUPLICATE')

  const id = newId()
  await exec(
    `INSERT INTO LeaderboardPrize (id, storeId, period, rank, prize, claimed, claimedAt)
     VALUES (?, ?, ?, ?, ?, 0, NULL)`,
    [id, storeId, period, b.rank, b.prize],
  )
  return NextResponse.json({ id }, { status: 201 })
}
