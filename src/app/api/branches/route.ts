// GET/POST /api/branches
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function ensureBranchTable() {
  await exec(`CREATE TABLE IF NOT EXISTS Branch (
    id           TEXT PRIMARY KEY,
    parentStoreId TEXT NOT NULL,
    name         TEXT NOT NULL,
    address      TEXT NOT NULL DEFAULT '',
    phone        TEXT NOT NULL DEFAULT '',
    managerId    TEXT,
    timezone     TEXT NOT NULL DEFAULT 'Asia/Jakarta',
    currency     TEXT NOT NULL DEFAULT 'IDR',
    active       INTEGER NOT NULL DEFAULT 1,
    createdAt    TEXT NOT NULL,
    updatedAt    TEXT NOT NULL
  )`)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureBranchTable()

  const rows = await query(
    `SELECT * FROM Branch WHERE parentStoreId = ? ORDER BY name ASC`,
    [storeId]
  )

  const branches = (rows as any[]).map(row => ({
    ...row,
    active: Boolean(row.active),
  }))

  return NextResponse.json(branches)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureBranchTable()

  const b = (await req.json()) as any
  if (!b.name) return err("Field 'name' is required", 400, 'MISSING_FIELD')

  const t = nowISO()
  const id = newId()
  await exec(
    `INSERT INTO Branch (id, parentStoreId, name, address, phone, managerId, timezone, currency, active, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      storeId,
      b.name,
      b.address ?? '',
      b.phone ?? '',
      b.managerId ?? null,
      b.timezone ?? 'Asia/Jakarta',
      b.currency ?? 'IDR',
      b.active !== false ? 1 : 0,
      t,
      t,
    ]
  )

  return NextResponse.json({ id }, { status: 201 })
}
