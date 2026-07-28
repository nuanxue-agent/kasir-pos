import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function ensureDeliveryZoneTables() {
  await exec(`CREATE TABLE IF NOT EXISTS DeliveryZone (
    id               TEXT PRIMARY KEY,
    storeId          TEXT NOT NULL,
    name             TEXT NOT NULL,
    minDistance      REAL NOT NULL DEFAULT 0,
    maxDistance      REAL NOT NULL DEFAULT 5,
    fee              REAL NOT NULL DEFAULT 0,
    estimatedMinutes INTEGER NOT NULL DEFAULT 30,
    active           INTEGER NOT NULL DEFAULT 1,
    createdAt        TEXT NOT NULL,
    updatedAt        TEXT NOT NULL
  )`)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureDeliveryZoneTables()

  const rows = await query(
    `SELECT * FROM DeliveryZone WHERE storeId = ? ORDER BY minDistance ASC`,
    [storeId],
  )

  const zones = (rows as any[]).map(r => ({
    ...r,
    active: Boolean(r.active),
    minDistance: Number(r.minDistance),
    maxDistance: Number(r.maxDistance),
    fee: Number(r.fee),
    estimatedMinutes: Number(r.estimatedMinutes),
  }))

  return NextResponse.json(zones)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureDeliveryZoneTables()

  const b = (await req.json()) as any
  if (!b.name?.trim()) return err("Field 'name' is required", 400, 'MISSING_FIELD')
  if (b.minDistance === undefined || b.minDistance === null) return err("Field 'minDistance' is required", 400, 'MISSING_FIELD')
  if (b.maxDistance === undefined || b.maxDistance === null) return err("Field 'maxDistance' is required", 400, 'MISSING_FIELD')
  if (Number(b.maxDistance) <= Number(b.minDistance)) return err('maxDistance must be greater than minDistance', 400, 'INVALID_FIELD')

  const t = nowISO()
  const id = newId()

  await exec(
    `INSERT INTO DeliveryZone (id, storeId, name, minDistance, maxDistance, fee, estimatedMinutes, active, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      storeId,
      b.name.trim(),
      Number(b.minDistance),
      Number(b.maxDistance),
      Number(b.fee ?? 0),
      Number(b.estimatedMinutes ?? 30),
      b.active !== false ? 1 : 0,
      t,
      t,
    ],
  )

  return NextResponse.json({ id }, { status: 201 })
}
