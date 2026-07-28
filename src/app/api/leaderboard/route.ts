import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function ensureLeaderboardTables() {
  await exec(`CREATE TABLE IF NOT EXISTS Leaderboard (
    id          TEXT PRIMARY KEY,
    storeId     TEXT NOT NULL,
    period      TEXT NOT NULL DEFAULT 'MONTHLY',
    customerId  TEXT NOT NULL,
    rank        INTEGER NOT NULL DEFAULT 0,
    points      REAL NOT NULL DEFAULT 0,
    totalSpend  REAL NOT NULL DEFAULT 0,
    visitCount  INTEGER NOT NULL DEFAULT 0,
    updatedAt   TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS LeaderboardPrize (
    id        TEXT PRIMARY KEY,
    storeId   TEXT NOT NULL,
    period    TEXT NOT NULL DEFAULT 'MONTHLY',
    rank      INTEGER NOT NULL DEFAULT 1,
    prize     TEXT NOT NULL,
    claimed   INTEGER NOT NULL DEFAULT 0,
    claimedAt TEXT
  )`)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  const period = req.nextUrl.searchParams.get('period') ?? 'MONTHLY'
  const validPeriods = ['WEEKLY', 'MONTHLY', 'ALL_TIME']
  if (!validPeriods.includes(period)) return err('Invalid period', 400, 'INVALID_FIELD')

  await ensureLeaderboardTables()

  const rows = await query(
    `SELECT l.*, c.name as customerName, c.email as customerEmail, c.phone as customerPhone
     FROM Leaderboard l
     LEFT JOIN Customer c ON l.customerId = c.id
     WHERE l.storeId = ? AND l.period = ?
     ORDER BY l.rank ASC`,
    [storeId, period],
  )

  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureLeaderboardTables()

  const b = (await req.json()) as any
  const period = b.period ?? 'MONTHLY'
  const validPeriods = ['WEEKLY', 'MONTHLY', 'ALL_TIME']
  if (!validPeriods.includes(period)) return err('Invalid period', 400, 'INVALID_FIELD')

  if (!b.customerId) return err("Field 'customerId' is required", 400, 'MISSING_FIELD')

  const t = nowISO()

  // Check if entry exists for this customer + period
  const existing = await query(
    `SELECT id FROM Leaderboard WHERE storeId = ? AND period = ? AND customerId = ?`,
    [storeId, period, b.customerId],
  )

  if (existing.length > 0) {
    const entry = existing[0] as any
    await exec(
      `UPDATE Leaderboard SET points = ?, totalSpend = ?, visitCount = ?, rank = ?, updatedAt = ? WHERE id = ?`,
      [b.points ?? 0, b.totalSpend ?? 0, b.visitCount ?? 0, b.rank ?? 0, t, entry.id],
    )
    return NextResponse.json({ id: entry.id, updated: true })
  }

  const id = newId()
  await exec(
    `INSERT INTO Leaderboard (id, storeId, period, customerId, rank, points, totalSpend, visitCount, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      storeId,
      period,
      b.customerId,
      b.rank ?? 0,
      b.points ?? 0,
      b.totalSpend ?? 0,
      b.visitCount ?? 0,
      t,
    ],
  )
  return NextResponse.json({ id }, { status: 201 })
}
