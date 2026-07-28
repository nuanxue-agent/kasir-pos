// GET /api/scheduled-campaigns?storeId=   POST /api/scheduled-campaigns
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

async function ensureTables() {
  await exec(`
    CREATE TABLE IF NOT EXISTS ScheduledCampaign (
      id          TEXT PRIMARY KEY,
      storeId     TEXT NOT NULL,
      campaignId  TEXT NOT NULL,
      startAt     TEXT NOT NULL,
      endAt       TEXT,
      status      TEXT NOT NULL DEFAULT 'PENDING',
      autoStart   INTEGER NOT NULL DEFAULT 1,
      autoStop    INTEGER NOT NULL DEFAULT 1,
      createdAt   TEXT NOT NULL,
      updatedAt   TEXT NOT NULL
    )
  `)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureTables()

  const status = req.nextUrl.searchParams.get('status')
  let sql = 'SELECT * FROM ScheduledCampaign WHERE storeId = ?'
  const params: any[] = [storeId]

  if (status) { sql += ' AND status = ?'; params.push(status) }

  sql += ' ORDER BY startAt ASC'

  const rows = await query(sql, params)
  const items = (rows as any[]).map(row => ({
    ...row,
    autoStart: Boolean(row.autoStart),
    autoStop: Boolean(row.autoStop),
  }))

  return NextResponse.json(items)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureTables()

  const b = (await req.json()) as any
  if (!b.campaignId?.trim()) return err("Field 'campaignId' is required", 400, 'MISSING_FIELD')
  if (!b.startAt?.trim()) return err("Field 'startAt' is required", 400, 'MISSING_FIELD')

  // Validate dates
  const startAt = new Date(b.startAt)
  const endAt = b.endAt ? new Date(b.endAt) : null

  if (isNaN(startAt.getTime())) return err('Invalid startAt date', 400, 'INVALID_FIELD')
  if (endAt && isNaN(endAt.getTime())) return err('Invalid endAt date', 400, 'INVALID_FIELD')
  if (endAt && startAt >= endAt) return err('startAt must be before endAt', 400, 'INVALID_FIELD')

  // Check for overlapping campaigns with same campaignId
  const overlapRows = await query(
    `SELECT id FROM ScheduledCampaign 
     WHERE storeId = ? AND campaignId = ? AND status IN ('PENDING', 'ACTIVE')
       AND ((startAt <= ? AND (endAt IS NULL OR endAt >= ?))
            OR (startAt <= ? AND (endAt IS NULL OR endAt >= ?))
            OR (startAt >= ? AND (endAt IS NULL OR startAt <= ?)))`,
    [
      storeId,
      b.campaignId,
      b.startAt, b.startAt,
      b.endAt ?? b.startAt, b.endAt ?? b.startAt,
      b.startAt, b.endAt ?? '9999-12-31'
    ]
  )

  if (overlapRows.length > 0) {
    return err('Campaign schedule overlaps with existing schedule', 400, 'OVERLAP_DETECTED')
  }

  const t = nowISO()
  const id = newId()

  await exec(
    `INSERT INTO ScheduledCampaign
      (id, storeId, campaignId, startAt, endAt, status, autoStart, autoStop, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?)`,
    [
      id,
      storeId,
      b.campaignId.trim(),
      b.startAt,
      b.endAt ?? null,
      b.autoStart !== false ? 1 : 0,
      b.autoStop !== false ? 1 : 0,
      t,
      t,
    ]
  )

  return NextResponse.json({ id, created: true }, { status: 201 })
}
