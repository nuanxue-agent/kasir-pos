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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')

  const { id: menuId } = await params
  await ensureTables()

  const menuRows = await query(`SELECT * FROM DigitalMenu WHERE id = ?`, [menuId])
  if (!menuRows[0]) return err('Menu not found', 404, 'NOT_FOUND')

  const items = await query(
    `SELECT * FROM DigitalMenuItem WHERE menuId = ? ORDER BY sortOrder ASC, createdAt ASC`,
    [menuId]
  )
  return NextResponse.json({ items })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const { id: menuId } = await params
  await ensureTables()

  const menuRows = await query(`SELECT * FROM DigitalMenu WHERE id = ?`, [menuId])
  const menu = menuRows[0] as any
  if (!menu) return err('Menu not found', 404, 'NOT_FOUND')

  const b = (await req.json()) as any
  if (!b.productId) return err("Field 'productId' is required", 400, 'MISSING_FIELD')
  if (b.price === undefined || b.price === null) return err("Field 'price' is required", 400, 'MISSING_FIELD')

  const storeId = menu.storeId as string

  // get current max sortOrder for this menu
  const countRows = await query(
    `SELECT COALESCE(MAX(sortOrder), -1) as maxOrder FROM DigitalMenuItem WHERE menuId = ?`,
    [menuId]
  )
  const nextOrder = ((countRows[0] as any)?.maxOrder ?? -1) + 1

  const id = newId()
  const now = nowISO()

  await exec(
    `INSERT INTO DigitalMenuItem (id, menuId, storeId, productId, displayName, description, imageUrl, price, available, sortOrder, categoryId, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    [
      id, menuId, storeId, b.productId,
      b.displayName ?? null,
      b.description ?? null,
      b.imageUrl ?? null,
      parseFloat(b.price),
      b.sortOrder ?? nextOrder,
      b.categoryId ?? null,
      now,
    ]
  )

  return NextResponse.json({ id }, { status: 201 })
}
