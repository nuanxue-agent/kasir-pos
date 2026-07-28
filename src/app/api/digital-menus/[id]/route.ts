import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, nowISO } from '@/lib/db'

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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')

  const { id } = await params
  await ensureTables()

  const rows = await query(`SELECT * FROM DigitalMenu WHERE id = ?`, [id])
  if (!rows[0]) return err('Menu not found', 404, 'NOT_FOUND')

  const b = (await req.json()) as any
  const now = nowISO()

  const fields: string[] = []
  const values: any[] = []

  if (b.name !== undefined) { fields.push('name = ?'); values.push(b.name) }
  if (b.active !== undefined) { fields.push('active = ?'); values.push(b.active ? 1 : 0) }
  if (b.primaryColor !== undefined) { fields.push('primaryColor = ?'); values.push(b.primaryColor) }
  if (b.logoUrl !== undefined) { fields.push('logoUrl = ?'); values.push(b.logoUrl) }
  if (b.welcomeMessage !== undefined) { fields.push('welcomeMessage = ?'); values.push(b.welcomeMessage) }

  if (fields.length === 0) return err('No fields to update', 400, 'MISSING_FIELD')

  fields.push('updatedAt = ?')
  values.push(now)
  values.push(id)

  await exec(`UPDATE DigitalMenu SET ${fields.join(', ')} WHERE id = ?`, values)

  return NextResponse.json({ id })
}
