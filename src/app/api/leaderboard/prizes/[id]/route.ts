import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, nowISO } from '@/lib/db'
import { ensureLeaderboardTables } from '../../route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')

  await ensureLeaderboardTables()

  const rows = await query(`SELECT * FROM LeaderboardPrize WHERE id = ?`, [id])
  if (rows.length === 0) return err('Prize not found', 404, 'NOT_FOUND')
  const prize = rows[0] as any

  const b = (await req.json()) as any

  if (b.claim === true) {
    if (prize.claimed) return err('Prize already claimed', 400, 'ALREADY_CLAIMED')
    await exec(`UPDATE LeaderboardPrize SET claimed = 1, claimedAt = ? WHERE id = ?`, [
      nowISO(),
      id,
    ])
    return NextResponse.json({ ok: true, claimed: true, claimedAt: nowISO() })
  }

  // General update (prize text, rank)
  const sets: string[] = []
  const vals: any[] = []

  if (b.prize !== undefined) {
    sets.push('prize = ?')
    vals.push(b.prize)
  }
  if (b.rank !== undefined) {
    sets.push('rank = ?')
    vals.push(b.rank)
  }
  if (b.period !== undefined) {
    const validPeriods = ['WEEKLY', 'MONTHLY', 'ALL_TIME']
    if (!validPeriods.includes(b.period)) return err('Invalid period', 400, 'INVALID_FIELD')
    sets.push('period = ?')
    vals.push(b.period)
  }

  if (sets.length === 0) return err('No fields to update', 400, 'MISSING_FIELD')
  vals.push(id)

  await exec(`UPDATE LeaderboardPrize SET ${sets.join(', ')} WHERE id = ?`, vals)
  return NextResponse.json({ ok: true })
}
