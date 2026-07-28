// PATCH /api/complaints/[id]
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { exec, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

const VALID_STATUSES = ['NEW', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  NEW:         ['ASSIGNED', 'IN_PROGRESS', 'CLOSED'],
  ASSIGNED:    ['IN_PROGRESS', 'RESOLVED', 'CLOSED'],
  IN_PROGRESS: ['RESOLVED', 'CLOSED'],
  RESOLVED:    ['CLOSED'],
  CLOSED:      [],
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')

  const { id } = await params
  const b = (await req.json()) as any

  const sets: string[] = []
  const vals: any[] = []

  if (b.status !== undefined) {
    if (!VALID_STATUSES.includes(b.status)) return err('Invalid status', 400, 'INVALID_FIELD')
    sets.push('status = ?')
    vals.push(b.status)
    if (b.status === 'RESOLVED') {
      sets.push('resolvedAt = ?')
      vals.push(nowISO())
    }
  }
  if (b.assignedTo !== undefined) { sets.push('assignedTo = ?'); vals.push(b.assignedTo) }
  if (b.priority !== undefined) { sets.push('priority = ?'); vals.push(b.priority) }
  if (b.resolution !== undefined) { sets.push('resolution = ?'); vals.push(b.resolution) }
  if (b.resolvedAt !== undefined) { sets.push('resolvedAt = ?'); vals.push(b.resolvedAt) }

  if (sets.length === 0) return err('No fields to update', 400, 'NO_FIELDS')

  sets.push('updatedAt = ?')
  vals.push(nowISO())
  vals.push(id)

  await exec(`UPDATE Complaint SET ${sets.join(', ')} WHERE id = ?`, vals)
  return NextResponse.json({ ok: true })
}
