// PATCH /api/credit-accounts/[id]
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, nowISO } from '@/lib/db'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

async function ensureTables() {
  await exec(`
    CREATE TABLE IF NOT EXISTS CreditAccount (
      id          TEXT PRIMARY KEY,
      storeId     TEXT NOT NULL,
      customerId  TEXT NOT NULL,
      creditLimit REAL NOT NULL DEFAULT 0,
      balance     REAL NOT NULL DEFAULT 0,
      status      TEXT NOT NULL DEFAULT 'ACTIVE'
                  CHECK(status IN ('ACTIVE','SUSPENDED','CLOSED')),
      createdAt   TEXT NOT NULL,
      updatedAt   TEXT NOT NULL,
      UNIQUE(storeId, customerId)
    )
  `)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)

  const { id } = await params
  const body = await req.json() as any
  const { creditLimit, status } = body

  if (creditLimit !== undefined && creditLimit <= 0) return err('creditLimit must be positive')
  if (status && !['ACTIVE', 'SUSPENDED', 'CLOSED'].includes(status)) return err('Invalid status')

  await ensureTables()

  const existing = await query('SELECT * FROM CreditAccount WHERE id = ?', [id])
  if (!(existing as any[]).length) return err('Account not found', 404)

  const now = nowISO()
  const updates: string[] = []
  const vals: any[] = []

  if (creditLimit !== undefined) { updates.push('creditLimit = ?'); vals.push(creditLimit) }
  if (status)                    { updates.push('status = ?');      vals.push(status) }
  updates.push('updatedAt = ?'); vals.push(now)
  vals.push(id)

  await exec(`UPDATE CreditAccount SET ${updates.join(', ')} WHERE id = ?`, vals)

  const updated = await query(
    `SELECT ca.*, c.name AS customerName, c.email AS customerEmail, c.phone AS customerPhone
     FROM CreditAccount ca LEFT JOIN Customer c ON c.id = ca.customerId
     WHERE ca.id = ?`,
    [id],
  )
  return NextResponse.json((updated as any[])[0])
}
