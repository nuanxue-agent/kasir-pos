import { NextRequest, NextResponse } from 'next/server'
import { query, exec, nowISO } from '@/lib/db'
import { ensureGrievanceTables } from '../route'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

const VALID_STATUSES = ['OPEN', 'UNDER_REVIEW', 'RESOLVED', 'CLOSED']

const VALID_TRANSITIONS: Record<string, string[]> = {
  OPEN:         ['UNDER_REVIEW', 'CLOSED'],
  UNDER_REVIEW: ['RESOLVED', 'CLOSED'],
  RESOLVED:     ['CLOSED'],
  CLOSED:       [],
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await ensureGrievanceTables()
    const { id } = await params
    const body = await req.json() as any
    const { status, resolution, resolvedBy } = body

    if (!status) return err('status required')
    if (!VALID_STATUSES.includes(status)) {
      return err(`status must be one of: ${VALID_STATUSES.join(', ')}`)
    }

    const rows = await query(`SELECT * FROM Grievance WHERE id = ?`, [id]) as any[]
    const grievance = rows[0]
    if (!grievance) return err('Grievance not found', 404)

    const allowed = VALID_TRANSITIONS[grievance.status] ?? []
    if (!allowed.includes(status)) {
      return err(`Cannot transition from ${grievance.status} to ${status}`)
    }

    const now = nowISO()
    const resolvedAt = (status === 'RESOLVED' || status === 'CLOSED') ? now : null

    await exec(
      `UPDATE Grievance
       SET status = ?, resolution = COALESCE(?, resolution), resolvedBy = COALESCE(?, resolvedBy),
           resolvedAt = COALESCE(?, resolvedAt), updatedAt = ?
       WHERE id = ?`,
      [status, resolution ?? null, resolvedBy ?? null, resolvedAt, now, id],
    )
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return err(e.message, 500)
  }
}
