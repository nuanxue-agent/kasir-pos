// GET /api/kits?storeId=
// POST /api/kits?storeId=
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function ensureKitTables() {
  await exec(`CREATE TABLE IF NOT EXISTS Kit (
    id              TEXT PRIMARY KEY,
    storeId         TEXT NOT NULL,
    name            TEXT NOT NULL,
    outputProductId TEXT NOT NULL,
    outputQty       REAL NOT NULL DEFAULT 1,
    instructions    TEXT,
    active          INTEGER NOT NULL DEFAULT 1,
    createdAt       TEXT NOT NULL,
    updatedAt       TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS KitComponent (
    id                 TEXT PRIMARY KEY,
    kitId              TEXT NOT NULL,
    storeId            TEXT NOT NULL,
    componentProductId TEXT NOT NULL,
    requiredQty        REAL NOT NULL DEFAULT 1
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS AssemblyJob (
    id          TEXT PRIMARY KEY,
    kitId       TEXT NOT NULL,
    storeId     TEXT NOT NULL,
    targetQty   REAL NOT NULL DEFAULT 1,
    status      TEXT NOT NULL DEFAULT 'PENDING',
    startedAt   TEXT,
    completedAt TEXT,
    createdAt   TEXT NOT NULL,
    updatedAt   TEXT NOT NULL
  )`)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureKitTables()

  const rows = await query(
    `SELECT k.*, p.name AS outputProductName
     FROM Kit k
     LEFT JOIN Product p ON p.id = k.outputProductId
     WHERE k.storeId = ?
     ORDER BY k.createdAt DESC`,
    [storeId],
  )

  const kits = (rows as any[]).map(r => ({ ...r, active: Boolean(r.active) }))
  return NextResponse.json(kits)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureKitTables()

  const b = (await req.json()) as any
  if (!b.name)            return err("'name' is required", 400, 'MISSING_FIELD')
  if (!b.outputProductId) return err("'outputProductId' is required", 400, 'MISSING_FIELD')

  const outputQty = Number(b.outputQty ?? 1)
  if (outputQty <= 0) return err("'outputQty' must be positive", 400, 'INVALID_FIELD')

  const t  = nowISO()
  const id = newId()

  await exec(
    `INSERT INTO Kit (id, storeId, name, outputProductId, outputQty, instructions, active, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, storeId, b.name, b.outputProductId, outputQty, b.instructions ?? null, 1, t, t],
  )

  return NextResponse.json({ id }, { status: 201 })
}
