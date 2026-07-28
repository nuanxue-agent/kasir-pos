// PATCH /api/tier-rules/[id]
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { exec, nowISO } from '@/lib/db'
import { ensureTierTables } from '../route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')

  const { id } = await params
  await ensureTierTables()

  const b = (await req.json()) as any
  const sets: string[] = []
  const vals: any[] = []

  if (b.tierName !== undefined) { sets.push('tierName = ?'); vals.push(b.tierName) }
  if (b.minSpend !== undefined) { sets.push('minSpend = ?'); vals.push(b.minSpend) }
  if (b.minPoints !== undefined) { sets.push('minPoints = ?'); vals.push(b.minPoints) }
  if (b.minVisits !== undefined) { sets.push('minVisits = ?'); vals.push(b.minVisits) }
  if (b.periodDays !== undefined) { sets.push('periodDays = ?'); vals.push(b.periodDays) }
  if (b.benefits !== undefined) { sets.push('benefits = ?'); vals.push(JSON.stringify(b.benefits)) }
  if (b.color !== undefined) { sets.push('color = ?'); vals.push(b.color) }
  if (b.icon !== undefined) { sets.push('icon = ?'); vals.push(b.icon) }
  if (b.active !== undefined) { sets.push('active = ?'); vals.push(b.active ? 1 : 0) }

  if (sets.length === 0) return err('No fields to update', 400, 'MISSING_FIELD')

  sets.push('updatedAt = ?')
  vals.push(nowISO())
  vals.push(id)

  await exec(`UPDATE TierRule SET ${sets.join(', ')} WHERE id = ?`, vals)
  return NextResponse.json({ ok: true })
}
