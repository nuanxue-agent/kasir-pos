import { NextRequest, NextResponse } from 'next/server'
import { query, exec } from '@/lib/db'

// Public endpoint — no auth required (customers scan QR)

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
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: menuId } = await params
  await ensureTables()

  const menuRows = await query(`SELECT * FROM DigitalMenu WHERE id = ?`, [menuId])
  const menu = menuRows[0] as any
  if (!menu) return err('Menu not found', 404, 'NOT_FOUND')
  if (!menu.active) return err('This menu is not active', 404, 'INACTIVE')

  const items = await query(
    `SELECT * FROM DigitalMenuItem WHERE menuId = ? AND available = 1 ORDER BY sortOrder ASC, createdAt ASC`,
    [menuId]
  )

  return NextResponse.json({ menu, items })
}
