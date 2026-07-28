import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, nowISO } from '@/lib/db'
import { ensureProductionTables } from '../route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  DRAFT:       ['SCHEDULED', 'CANCELLED'],
  SCHEDULED:   ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED:   [],
  CANCELLED:   [],
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const { id } = await params
  const b = (await req.json()) as any
  const storeId = b.storeId ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureProductionTables()

  const rows = await query(
    `SELECT * FROM ProductionOrder WHERE id = ? AND storeId = ?`,
    [id, storeId],
  ) as any[]
  if (!rows.length) return err('Production order not found', 404, 'NOT_FOUND')
  const order = rows[0]

  const updates: string[] = []
  const vals: any[] = []

  if (b.status !== undefined) {
    const allowed = VALID_TRANSITIONS[order.status as string] ?? []
    if (!allowed.includes(b.status)) {
      return err(`Cannot transition from ${order.status} to ${b.status}`, 400, 'INVALID_TRANSITION')
    }
    updates.push('status = ?')
    vals.push(b.status)
    if (b.status === 'COMPLETED') {
      updates.push('completedDate = ?')
      vals.push(nowISO())
    }
  }

  if (b.notes !== undefined) { updates.push('notes = ?'); vals.push(b.notes) }
  if (b.scheduledDate !== undefined) { updates.push('scheduledDate = ?'); vals.push(b.scheduledDate) }

  if (!updates.length) return err('No fields to update', 400, 'NO_UPDATES')

  updates.push('updatedAt = ?')
  vals.push(nowISO())
  vals.push(id)

  await exec(`UPDATE ProductionOrder SET ${updates.join(', ')} WHERE id = ?`, vals)

  const [updated] = await query(`SELECT * FROM ProductionOrder WHERE id = ?`, [id]) as any[]
  return NextResponse.json(updated)
}
