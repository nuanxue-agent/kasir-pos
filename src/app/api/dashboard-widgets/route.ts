// GET /api/dashboard-widgets?storeId=
// POST /api/dashboard-widgets  — bulk upsert layout
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

async function ensureTables() {
  await exec(`
    CREATE TABLE IF NOT EXISTS DashboardWidget (
      id         TEXT PRIMARY KEY,
      storeId    TEXT NOT NULL,
      userId     TEXT NOT NULL,
      widgetType TEXT NOT NULL,
      position   TEXT NOT NULL DEFAULT '{"col":1,"row":1}',
      config     TEXT NOT NULL DEFAULT '{}',
      active     INTEGER NOT NULL DEFAULT 1,
      createdAt  TEXT NOT NULL,
      updatedAt  TEXT NOT NULL
    )
  `)
}

function deserialize(row: any) {
  return {
    ...row,
    active: Boolean(row.active),
    position: typeof row.position === 'string' ? JSON.parse(row.position) : row.position,
    config: typeof row.config === 'string' ? JSON.parse(row.config) : row.config,
  }
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureTables()

  const userId = user.id ?? user.sub ?? ''
  const rows = await query(
    `SELECT * FROM DashboardWidget WHERE storeId=? AND userId=? ORDER BY json_extract(position,'$.row'), json_extract(position,'$.col')`,
    [storeId, userId],
  )
  return NextResponse.json((rows as any[]).map(deserialize))
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureTables()

  const body = (await req.json()) as any
  const widgets: any[] = body.widgets ?? []
  if (!Array.isArray(widgets)) return err('widgets must be an array', 400, 'VALIDATION_ERROR')

  const userId = user.id ?? user.sub ?? ''
  const now = nowISO()

  // Delete existing layout for this user+store, then re-insert
  await exec(`DELETE FROM DashboardWidget WHERE storeId=? AND userId=?`, [storeId, userId])

  for (const w of widgets) {
    const id = w.id ?? newId()
    await exec(
      `INSERT INTO DashboardWidget (id, storeId, userId, widgetType, position, config, active, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        storeId,
        userId,
        w.widgetType,
        JSON.stringify(w.position ?? { col: 1, row: 1 }),
        JSON.stringify(w.config ?? {}),
        w.active !== false ? 1 : 0,
        now,
        now,
      ],
    )
  }

  const rows = await query(
    `SELECT * FROM DashboardWidget WHERE storeId=? AND userId=? ORDER BY json_extract(position,'$.row'), json_extract(position,'$.col')`,
    [storeId, userId],
  )
  return NextResponse.json((rows as any[]).map(deserialize))
}
