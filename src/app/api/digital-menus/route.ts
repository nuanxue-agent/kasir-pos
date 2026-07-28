import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

async function ensureTables() {
  await exec(`CREATE TABLE IF NOT EXISTS DigitalMenu (
    id             TEXT PRIMARY KEY,
    storeId        TEXT NOT NULL,
    name           TEXT NOT NULL DEFAULT 'Menu Digital',
    active         INTEGER NOT NULL DEFAULT 1,
    primaryColor   TEXT NOT NULL DEFAULT '#4f46e5',
    logoUrl        TEXT,
    welcomeMessage TEXT,
    createdAt      TEXT NOT NULL,
    updatedAt      TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS DigitalMenuItem (
    id          TEXT PRIMARY KEY,
    menuId      TEXT NOT NULL,
    storeId     TEXT NOT NULL,
    productId   TEXT NOT NULL,
    displayName TEXT,
    description TEXT,
    imageUrl    TEXT,
    price       REAL NOT NULL DEFAULT 0,
    available   INTEGER NOT NULL DEFAULT 1,
    sortOrder   INTEGER NOT NULL DEFAULT 0,
    categoryId  TEXT,
    createdAt   TEXT NOT NULL
  )`)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureTables()

  const rows = await query(
    `SELECT * FROM DigitalMenu WHERE storeId = ? ORDER BY createdAt DESC`,
    [storeId]
  )
  return NextResponse.json({ menus: rows })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureTables()

  const b = (await req.json()) as any
  const name = (b.name as string | undefined)?.trim() || 'Menu Digital'

  const id = newId()
  const now = nowISO()

  await exec(
    `INSERT INTO DigitalMenu (id, storeId, name, active, primaryColor, logoUrl, welcomeMessage, createdAt, updatedAt)
     VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)`,
    [id, storeId, name, b.primaryColor ?? '#4f46e5', b.logoUrl ?? null, b.welcomeMessage ?? null, now, now]
  )

  return NextResponse.json({ id }, { status: 201 })
}
