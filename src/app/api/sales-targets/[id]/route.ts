import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { exec, queryOne, nowISO } from '@/lib/db'
import { ensureSalesTargetTables } from '../route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any
  const storeIds: string[] = user.stores?.map((s: any) => s.id) ?? []

  try {
    await ensureSalesTargetTables()

    const row = await queryOne(`SELECT * FROM SalesTarget WHERE id = ?`, [id]) as any
    if (!row) return err('Not found', 404, 'NOT_FOUND')
    if (!storeIds.includes(row.storeId)) return err('Forbidden', 403, 'FORBIDDEN')

    const b = (await req.json()) as any

    const sets: string[] = []
    const vals: any[] = []

    if (b.targetAmount !== undefined) {
      const amt = Number(b.targetAmount)
      if (isNaN(amt) || amt < 0) return err('targetAmount must be non-negative', 400, 'INVALID_FIELD')
      sets.push('targetAmount = ?'); vals.push(amt)
    }
    if (b.startDate !== undefined) { sets.push('startDate = ?'); vals.push(b.startDate) }
    if (b.endDate !== undefined) { sets.push('endDate = ?'); vals.push(b.endDate) }
    if (b.period !== undefined) {
      const VALID_PERIODS = ['DAILY', 'WEEKLY', 'MONTHLY']
      if (!VALID_PERIODS.includes(b.period)) return err('Invalid period', 400, 'INVALID_FIELD')
      sets.push('period = ?'); vals.push(b.period)
    }

    if (sets.length === 0) return err('No fields to update', 400, 'MISSING_FIELD')

    sets.push('updatedAt = ?'); vals.push(nowISO()); vals.push(id)
    await exec(`UPDATE SalesTarget SET ${sets.join(', ')} WHERE id = ?`, vals)

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500, 'INTERNAL_ERROR')
  }
}
