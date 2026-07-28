import { NextRequest, NextResponse } from 'next/server'
import { exec, queryOne, nowISO } from '@/lib/db'
import { isValidCycleTransition, type ReviewCycleStatus } from '@/lib/performance-review'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const body = (await req.json()) as {
      name?: string
      startDate?: string
      endDate?: string
      status?: string
      type?: string
    }
    const { name, startDate, endDate, status, type } = body

    // Validate status transition if changing status
    if (status) {
      const existing = await queryOne<{ status: string }>(
        'SELECT status FROM ReviewCycle WHERE id = ?',
        [params.id],
      )
      if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      if (
        !isValidCycleTransition(
          existing.status as ReviewCycleStatus,
          status as ReviewCycleStatus,
        )
      ) {
        return NextResponse.json(
          { error: `Invalid status transition: ${existing.status} → ${status}` },
          { status: 400 },
        )
      }
    }

    const sets: string[] = []
    const vals: any[] = []
    if (name !== undefined) { sets.push('name = ?'); vals.push(name) }
    if (startDate !== undefined) { sets.push('startDate = ?'); vals.push(startDate) }
    if (endDate !== undefined) { sets.push('endDate = ?'); vals.push(endDate) }
    if (status !== undefined) { sets.push('status = ?'); vals.push(status) }
    if (type !== undefined) { sets.push('type = ?'); vals.push(type) }

    if (sets.length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    sets.push('updatedAt = ?')
    vals.push(nowISO())
    vals.push(params.id)

    await exec(`UPDATE ReviewCycle SET ${sets.join(', ')} WHERE id = ?`, vals)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
