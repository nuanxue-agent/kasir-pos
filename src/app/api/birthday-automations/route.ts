// GET /api/birthday-automations?storeId=
// POST /api/birthday-automations?storeId=
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function ensureBirthdayTables() {
  await exec(`
    CREATE TABLE IF NOT EXISTS BirthdayAutomation (
      id                 TEXT PRIMARY KEY,
      storeId            TEXT NOT NULL,
      triggerType        TEXT NOT NULL DEFAULT 'BIRTHDAY',
      daysBeforeTrigger  INTEGER NOT NULL DEFAULT 0,
      rewardType         TEXT NOT NULL DEFAULT 'VOUCHER',
      rewardValue        REAL NOT NULL DEFAULT 0,
      message            TEXT NOT NULL DEFAULT '',
      active             INTEGER NOT NULL DEFAULT 1,
      createdAt          TEXT NOT NULL,
      updatedAt          TEXT NOT NULL
    )
  `)
  await exec(`
    CREATE TABLE IF NOT EXISTS BirthdayQueue (
      id             TEXT PRIMARY KEY,
      customerId     TEXT NOT NULL,
      storeId        TEXT NOT NULL,
      automationId   TEXT NOT NULL,
      scheduledDate  TEXT NOT NULL,
      status         TEXT NOT NULL DEFAULT 'PENDING',
      sentAt         TEXT,
      createdAt      TEXT NOT NULL,
      updatedAt      TEXT NOT NULL
    )
  `)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureBirthdayTables()

  const rows = await query(
    `SELECT * FROM BirthdayAutomation WHERE storeId = ? ORDER BY createdAt DESC`,
    [storeId],
  )

  const automations = (rows as any[]).map(r => ({
    ...r,
    active: Boolean(r.active),
  }))

  return NextResponse.json(automations)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureBirthdayTables()

  const b = (await req.json()) as any

  if (!b.triggerType) return err("Field 'triggerType' is required", 400, 'MISSING_FIELD')
  if (!['BIRTHDAY', 'ANNIVERSARY', 'SIGNUP_ANNIVERSARY'].includes(b.triggerType))
    return err('Invalid triggerType', 400, 'INVALID_FIELD')
  if (!b.rewardType) return err("Field 'rewardType' is required", 400, 'MISSING_FIELD')
  if (!['VOUCHER', 'POINTS', 'DISCOUNT'].includes(b.rewardType))
    return err('Invalid rewardType', 400, 'INVALID_FIELD')
  if (b.rewardValue == null || isNaN(Number(b.rewardValue)))
    return err("Field 'rewardValue' is required", 400, 'MISSING_FIELD')

  const t = nowISO()
  const id = newId()
  await exec(
    `INSERT INTO BirthdayAutomation
      (id, storeId, triggerType, daysBeforeTrigger, rewardType, rewardValue, message, active, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      storeId,
      b.triggerType,
      Number(b.daysBeforeTrigger ?? 0),
      b.rewardType,
      Number(b.rewardValue),
      b.message ?? '',
      b.active !== false ? 1 : 0,
      t,
      t,
    ],
  )

  return NextResponse.json({ id }, { status: 201 })
}
