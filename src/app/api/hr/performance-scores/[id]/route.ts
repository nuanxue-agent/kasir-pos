import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, queryOne, nowISO } from '@/lib/db'
import { ensurePerformanceScoreTable } from '../route'

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

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensurePerformanceScoreTable()

  const row = await queryOne(`SELECT * FROM PerformanceScore WHERE id = ? AND storeId = ?`, [id, storeId]) as any
  if (!row) return err('Not found', 404, 'NOT_FOUND')

  const b = (await req.json()) as any

  const sets: string[] = []
  const vals: any[] = []

  if (b.salesScore !== undefined) { sets.push('salesScore = ?'); vals.push(Number(b.salesScore)) }
  if (b.attendanceScore !== undefined) { sets.push('attendanceScore = ?'); vals.push(Number(b.attendanceScore)) }
  if (b.customerScore !== undefined) { sets.push('customerScore = ?'); vals.push(Number(b.customerScore)) }
  if (b.overallScore !== undefined) { sets.push('overallScore = ?'); vals.push(Number(b.overallScore)) }
  if (b.badge !== undefined) { sets.push('badge = ?'); vals.push(b.badge) }
  if (b.rank !== undefined) { sets.push('rank = ?'); vals.push(Number(b.rank)) }

  if (sets.length === 0) return err('No fields to update', 400, 'MISSING_FIELD')

  sets.push('updatedAt = ?')
  vals.push(nowISO())
  vals.push(id)

  await exec(`UPDATE PerformanceScore SET ${sets.join(', ')} WHERE id = ?`, vals)

  // Re-rank the period if scores changed
  if (b.overallScore !== undefined || b.salesScore !== undefined) {
    const periodRows = await query(
      `SELECT id, overallScore, salesScore FROM PerformanceScore WHERE storeId = ? AND period = ? ORDER BY overallScore DESC, salesScore DESC`,
      [storeId, row.period],
    )
    const t = nowISO()
    for (let i = 0; i < (periodRows as any[]).length; i++) {
      await exec(
        `UPDATE PerformanceScore SET rank = ?, updatedAt = ? WHERE id = ?`,
        [i + 1, t, (periodRows as any[])[i].id],
      )
    }
  }

  return NextResponse.json({ ok: true })
}
