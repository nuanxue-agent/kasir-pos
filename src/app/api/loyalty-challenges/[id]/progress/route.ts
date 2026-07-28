// POST /api/loyalty-challenges/:id/progress
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { queryOne, exec, newId, nowISO } from '@/lib/db'
import { calcChallengeProgress } from '@/lib/loyalty-tiers'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

async function ensureTables() {
  await exec(`
    CREATE TABLE IF NOT EXISTS LoyaltyChallenge (
      id           TEXT PRIMARY KEY,
      storeId      TEXT NOT NULL,
      name         TEXT NOT NULL,
      description  TEXT NOT NULL DEFAULT '',
      targetType   TEXT NOT NULL DEFAULT 'PURCHASE_COUNT',
      targetValue  REAL NOT NULL DEFAULT 1,
      rewardPoints INTEGER NOT NULL DEFAULT 0,
      startAt      TEXT NOT NULL,
      endAt        TEXT NOT NULL,
      active       INTEGER NOT NULL DEFAULT 1,
      createdAt    TEXT NOT NULL
    )
  `)
  await exec(`
    CREATE TABLE IF NOT EXISTS CustomerChallenge (
      id          TEXT PRIMARY KEY,
      challengeId TEXT NOT NULL,
      customerId  TEXT NOT NULL,
      progress    REAL NOT NULL DEFAULT 0,
      completed   INTEGER NOT NULL DEFAULT 0,
      completedAt TEXT,
      createdAt   TEXT NOT NULL,
      UNIQUE(challengeId, customerId)
    )
  `)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')

  await ensureTables()

  const { id: challengeId } = await params
  const challenge = await queryOne(`SELECT * FROM LoyaltyChallenge WHERE id=?`, [challengeId])
  if (!challenge) return err('Challenge not found', 404, 'NOT_FOUND')
  if (!(challenge as any).active) return err('Challenge is not active', 400, 'INACTIVE')

  const b = (await req.json()) as any
  if (!b.customerId) return err("Field 'customerId' is required", 400, 'MISSING_FIELD')
  const increment = Number(b.increment ?? 1)
  if (isNaN(increment) || increment < 0)
    return err("'increment' must be a non-negative number", 400, 'INVALID_VALUE')

  const existing = await queryOne(
    `SELECT * FROM CustomerChallenge WHERE challengeId=? AND customerId=?`,
    [challengeId, b.customerId],
  )

  const currentProgress = existing ? Number((existing as any).progress) : 0
  const targetValue = Number((challenge as any).targetValue)
  const { progress, completed } = calcChallengeProgress(currentProgress, increment, targetValue)

  const now = nowISO()

  if (existing) {
    await exec(
      `UPDATE CustomerChallenge SET progress=?, completed=?, completedAt=? WHERE challengeId=? AND customerId=?`,
      [
        progress,
        completed ? 1 : 0,
        completed && !(existing as any).completed ? now : (existing as any).completedAt ?? null,
        challengeId,
        b.customerId,
      ],
    )
  } else {
    await exec(
      `INSERT INTO CustomerChallenge (id,challengeId,customerId,progress,completed,completedAt,createdAt)
       VALUES (?,?,?,?,?,?,?)`,
      [newId(), challengeId, b.customerId, progress, completed ? 1 : 0, completed ? now : null, now],
    )
  }

  const justCompleted = completed && (existing ? !(existing as any).completed : true)

  return NextResponse.json({
    challengeId,
    customerId: b.customerId,
    progress,
    completed,
    justCompleted,
    rewardPoints: justCompleted ? Number((challenge as any).rewardPoints) : 0,
  })
}
