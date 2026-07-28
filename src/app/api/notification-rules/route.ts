// GET /api/notification-rules?storeId=
// POST /api/notification-rules?storeId=
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function ensureNotificationTables() {
  await exec(`
    CREATE TABLE IF NOT EXISTS NotificationRule (
      id        TEXT PRIMARY KEY,
      storeId   TEXT NOT NULL,
      event     TEXT NOT NULL,
      channel   TEXT NOT NULL DEFAULT 'IN_APP',
      threshold REAL NOT NULL DEFAULT 0,
      active    INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `)
  await exec(`
    CREATE TABLE IF NOT EXISTS NotificationLog (
      id        TEXT PRIMARY KEY,
      storeId   TEXT NOT NULL,
      ruleId    TEXT,
      event     TEXT NOT NULL,
      message   TEXT NOT NULL,
      channel   TEXT NOT NULL DEFAULT 'IN_APP',
      status    TEXT NOT NULL DEFAULT 'PENDING',
      read      INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL
    )
  `)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureNotificationTables()

  const rows = await query(
    `SELECT * FROM NotificationRule WHERE storeId = ? ORDER BY createdAt DESC`,
    [storeId],
  )
  const rules = (rows as any[]).map(r => ({
    ...r,
    active: Boolean(r.active),
  }))
  return NextResponse.json(rules)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureNotificationTables()

  const b = (await req.json()) as any

  const VALID_EVENTS = [
    'LOW_STOCK', 'NEW_ORDER', 'COMPLAINT', 'PAYMENT_DUE',
    'BIRTHDAY', 'REORDER_NEEDED', 'ATTENDANCE_LATE',
  ]
  const VALID_CHANNELS = ['IN_APP', 'EMAIL', 'WHATSAPP']

  if (!b.event) return err("Field 'event' is required", 400, 'MISSING_FIELD')
  if (!VALID_EVENTS.includes(b.event)) return err('Invalid event type', 400, 'INVALID_FIELD')
  if (b.channel && !VALID_CHANNELS.includes(b.channel)) return err('Invalid channel', 400, 'INVALID_FIELD')

  const t = nowISO()
  const id = newId()
  await exec(
    `INSERT INTO NotificationRule (id, storeId, event, channel, threshold, active, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      storeId,
      b.event,
      b.channel ?? 'IN_APP',
      b.threshold ?? 0,
      b.active !== false ? 1 : 0,
      t,
      t,
    ],
  )
  return NextResponse.json({ id }, { status: 201 })
}
