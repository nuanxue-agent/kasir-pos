import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

async function ensureTable() {
  await exec(`CREATE TABLE IF NOT EXISTS InventoryWriteOff (
    id          TEXT PRIMARY KEY,
    storeId     TEXT NOT NULL,
    productId   TEXT NOT NULL,
    productName TEXT NOT NULL,
    qty         REAL NOT NULL DEFAULT 0,
    reason      TEXT NOT NULL DEFAULT 'OTHER',
    costValue   REAL NOT NULL DEFAULT 0,
    approvedBy  TEXT,
    approvedAt  TEXT,
    status      TEXT NOT NULL DEFAULT 'PENDING',
    notes       TEXT,
    createdAt   TEXT NOT NULL,
    createdBy   TEXT NOT NULL
  )`)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const { id } = await params

  await ensureTable()

  const rows = await query(`SELECT * FROM InventoryWriteOff WHERE id = ?`, [id])
  const wo = rows[0] as any
  if (!wo) return err('Write-off not found', 404, 'NOT_FOUND')

  if (wo.status !== 'PENDING') {
    return err('Only PENDING write-offs can be approved or rejected', 400, 'INVALID_STATUS')
  }

  const b = (await req.json()) as any
  const action = b.action as string
  if (action !== 'approve' && action !== 'reject') {
    return err("action must be 'approve' or 'reject'", 400, 'INVALID_FIELD')
  }

  const newStatus = action === 'approve' ? 'APPROVED' : 'REJECTED'
  const approvedBy = (user.name ?? user.email ?? 'Unknown') as string
  const now = nowISO()

  await exec(
    `UPDATE InventoryWriteOff SET status = ?, approvedBy = ?, approvedAt = ? WHERE id = ?`,
    [newStatus, approvedBy, now, id]
  )

  return NextResponse.json({ id, status: newStatus })
}
