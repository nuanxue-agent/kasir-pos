// GET /api/dashboard-layouts?storeId=
// POST /api/dashboard-layouts?storeId=
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import { buildDefaultWidgets, serializeWidgets, deserializeWidgets } from '@/lib/custom-dashboard'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function ensureDashboardLayoutTable() {
  await exec(`CREATE TABLE IF NOT EXISTS DashboardLayout (
    id        TEXT PRIMARY KEY,
    storeId   TEXT NOT NULL,
    userId    TEXT NOT NULL,
    name      TEXT NOT NULL,
    widgets   TEXT NOT NULL DEFAULT '[]',
    isDefault INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`)
}

function mapRow(row: any) {
  return {
    ...row,
    isDefault: Boolean(row.isDefault),
    widgets: deserializeWidgets(row.widgets),
  }
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  const hasAccess = user.stores?.some((s: { id: string }) => s.id === storeId) ?? false
  if (!hasAccess) return err('Forbidden', 403, 'FORBIDDEN')

  await ensureDashboardLayoutTable()

  const rows = await query(
    `SELECT * FROM DashboardLayout WHERE storeId = ? AND userId = ? ORDER BY isDefault DESC, createdAt DESC`,
    [storeId, user.id ?? user.email ?? ''],
  ) as any[]

  return ok(rows.map(mapRow))
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  const hasAccess = user.stores?.some((s: { id: string }) => s.id === storeId) ?? false
  if (!hasAccess) return err('Forbidden', 403, 'FORBIDDEN')

  await ensureDashboardLayoutTable()

  const b = (await req.json()) as any
  const name: string = b.name?.trim()
  if (!name) return err("Field 'name' is required", 400, 'MISSING_FIELD')

  const userId = user.id ?? user.email ?? ''
  const widgets = Array.isArray(b.widgets) ? b.widgets : buildDefaultWidgets()
  const t = nowISO()
  const id = newId()

  // If this is marked as default, clear existing defaults first
  if (b.isDefault) {
    await exec(
      `UPDATE DashboardLayout SET isDefault = 0, updatedAt = ? WHERE storeId = ? AND userId = ?`,
      [t, storeId, userId],
    )
  }

  await exec(
    `INSERT INTO DashboardLayout (id, storeId, userId, name, widgets, isDefault, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, storeId, userId, name, serializeWidgets(widgets), b.isDefault ? 1 : 0, t, t],
  )

  return ok({ id }, 201)
}
