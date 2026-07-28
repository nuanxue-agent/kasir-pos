// PATCH /api/intercompany-transfers/:id
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { queryOne, exec } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

async function ensureTable() {
  await exec(`
    CREATE TABLE IF NOT EXISTS InterCompanyTransfer (
      id          TEXT PRIMARY KEY,
      fromStoreId TEXT NOT NULL,
      toStoreId   TEXT NOT NULL,
      type        TEXT NOT NULL CHECK(type IN ('STOCK','CASH')),
      amount      REAL NOT NULL DEFAULT 0,
      productId   TEXT,
      qty         REAL,
      status      TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','COMPLETED')),
      createdAt   TEXT NOT NULL
    )
  `)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')

  await ensureTable()

  const { id } = await params
  const existing = (await queryOne(`SELECT * FROM InterCompanyTransfer WHERE id = ?`, [id])) as any
  if (!existing) return err('Transfer not found', 404, 'NOT_FOUND')

  const b = (await req.json()) as Record<string, any>
  if (b.status && !['PENDING', 'COMPLETED'].includes(b.status))
    return err("status must be 'PENDING' or 'COMPLETED'", 400, 'INVALID_VALUE')

  const newStatus = b.status ?? existing.status
  await exec(`UPDATE InterCompanyTransfer SET status = ? WHERE id = ?`, [newStatus, id])
  const updated = await queryOne(`SELECT * FROM InterCompanyTransfer WHERE id = ?`, [id])
  return NextResponse.json({ transfer: updated })
}
