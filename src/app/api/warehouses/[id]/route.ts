// PATCH /api/warehouses/:id
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

async function ensureTable() {
  await exec(`
    CREATE TABLE IF NOT EXISTS Warehouse (
      id        TEXT PRIMARY KEY,
      storeId   TEXT NOT NULL,
      name      TEXT NOT NULL,
      address   TEXT,
      type      TEXT NOT NULL DEFAULT 'MAIN' CHECK(type IN ('MAIN','SATELLITE','TRANSIT')),
      active    INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL
    )
  `)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')

  await ensureTable()

  const { id } = await params
  const rows = (await query(`SELECT * FROM Warehouse WHERE id = ?`, [id])) as any[]
  if (!rows.length) return err('Warehouse not found', 404, 'NOT_FOUND')
  const existing = rows[0]

  const b = (await req.json()) as Record<string, any>
  if (b.type && !['MAIN', 'SATELLITE', 'TRANSIT'].includes(b.type))
    return err("type must be MAIN, SATELLITE, or TRANSIT", 400, 'INVALID_VALUE')

  const name = b.name ?? existing.name
  const address = b.address !== undefined ? b.address : existing.address
  const type = b.type ?? existing.type
  const active = b.active !== undefined ? (b.active ? 1 : 0) : existing.active

  await exec(
    `UPDATE Warehouse SET name = ?, address = ?, type = ?, active = ? WHERE id = ?`,
    [name, address, type, active, id],
  )
  const updated = (await query(`SELECT * FROM Warehouse WHERE id = ?`, [id])) as any[]
  return NextResponse.json({ warehouse: updated[0] })
}
