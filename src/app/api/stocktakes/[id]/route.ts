// PATCH /api/stocktakes/[id]  — status update (DRAFT→IN_PROGRESS→COMPLETED)
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, nowISO } from '@/lib/db'
import { ensureStocktakeTables } from '../route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

type StocktakeStatus = 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED'

const ALLOWED_TRANSITIONS: Record<StocktakeStatus, StocktakeStatus[]> = {
  DRAFT:       ['IN_PROGRESS'],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED:   [],
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const { id } = await params

  await ensureStocktakeTables()

  const rows = await query(`SELECT * FROM Stocktake WHERE id = ?`, [id])
  if (rows.length === 0) return err('Not found', 404, 'NOT_FOUND')
  const take = rows[0] as any

  const b = (await req.json()) as any
  const sets: string[] = []
  const vals: any[] = []
  const t = nowISO()

  if (b.status !== undefined) {
    const current = take.status as StocktakeStatus
    const next = b.status as StocktakeStatus
    if (!ALLOWED_TRANSITIONS[current]?.includes(next)) {
      return err(`Cannot transition from ${current} to ${next}`, 400, 'INVALID_TRANSITION')
    }
    sets.push('status = ?')
    vals.push(next)

    if (next === 'IN_PROGRESS' && !take.startedAt) {
      sets.push('startedAt = ?')
      vals.push(t)
    }

    if (next === 'COMPLETED') {
      sets.push('completedAt = ?')
      vals.push(t)
      if (b.completedBy !== undefined) {
        sets.push('completedBy = ?')
        vals.push(b.completedBy)
      } else {
        sets.push('completedBy = ?')
        vals.push((user as any).email ?? null)
      }
    }
  }

  if (b.name !== undefined) { sets.push('name = ?'); vals.push(b.name) }
  if (b.notes !== undefined) { sets.push('notes = ?'); vals.push(b.notes) }
  if (b.warehouseId !== undefined) { sets.push('warehouseId = ?'); vals.push(b.warehouseId) }

  if (sets.length === 0) return err('No fields to update', 400, 'NO_FIELDS')
  sets.push('updatedAt = ?')
  vals.push(t)
  vals.push(id)

  await exec(`UPDATE Stocktake SET ${sets.join(', ')} WHERE id = ?`, vals)

  const [updated] = await query(`SELECT * FROM Stocktake WHERE id = ?`, [id])
  return NextResponse.json(updated)
}
