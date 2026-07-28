import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function ensureLabelTables() {
  await exec(`CREATE TABLE IF NOT EXISTS LabelTemplate (
    id        TEXT PRIMARY KEY,
    storeId   TEXT NOT NULL,
    name      TEXT NOT NULL,
    width     REAL NOT NULL DEFAULT 60,
    height    REAL NOT NULL DEFAULT 40,
    fields    TEXT NOT NULL DEFAULT '[]',
    active    INTEGER NOT NULL DEFAULT 1,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS LabelPrintJob (
    id         TEXT PRIMARY KEY,
    storeId    TEXT NOT NULL,
    templateId TEXT NOT NULL,
    products   TEXT NOT NULL DEFAULT '[]',
    status     TEXT NOT NULL DEFAULT 'PENDING',
    createdAt  TEXT NOT NULL,
    updatedAt  TEXT NOT NULL
  )`)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureLabelTables()

  const rows = await query(
    `SELECT * FROM LabelTemplate WHERE storeId = ? ORDER BY createdAt DESC`,
    [storeId]
  )

  const templates = (rows as any[]).map(row => ({
    ...row,
    active: Boolean(row.active),
    fields: JSON.parse(row.fields || '[]'),
  }))

  return NextResponse.json(templates)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureLabelTables()

  const b = (await req.json()) as any
  if (!b.name?.trim()) return err("Field 'name' is required", 400, 'MISSING_FIELD')
  if (!b.width || b.width <= 0) return err('Width must be positive', 400, 'INVALID_FIELD')
  if (!b.height || b.height <= 0) return err('Height must be positive', 400, 'INVALID_FIELD')
  if (!Array.isArray(b.fields) || b.fields.length === 0) {
    return err('At least one field is required', 400, 'MISSING_FIELD')
  }

  const t = nowISO()
  const id = newId()
  await exec(
    `INSERT INTO LabelTemplate (id, storeId, name, width, height, fields, active, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    [id, storeId, b.name.trim(), b.width, b.height, JSON.stringify(b.fields), t, t]
  )

  return NextResponse.json({ id }, { status: 201 })
}
