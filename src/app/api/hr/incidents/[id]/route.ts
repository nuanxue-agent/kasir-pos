import { NextRequest, NextResponse } from 'next/server'
import { exec, nowISO } from '@/lib/db'
import { ensureIncidentTable } from '../route'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    await ensureIncidentTable()
    const body = await req.json() as any

    const VALID_STATUSES = ['OPEN', 'INVESTIGATING', 'RESOLVED']
    const VALID_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH']

    const sets: string[] = []
    const vals: any[] = []
    if (body.status !== undefined) {
      if (!VALID_STATUSES.includes(body.status)) return err(`status must be one of: ${VALID_STATUSES.join(', ')}`)
      sets.push('status = ?'); vals.push(body.status)
    }
    if (body.severity !== undefined) {
      if (!VALID_SEVERITIES.includes(body.severity)) return err(`severity must be one of: ${VALID_SEVERITIES.join(', ')}`)
      sets.push('severity = ?'); vals.push(body.severity)
    }
    if (body.description !== undefined) { sets.push('description = ?'); vals.push(body.description) }
    if (body.involvedEmployees !== undefined) {
      sets.push('involvedEmployees = ?')
      vals.push(JSON.stringify(body.involvedEmployees))
    }
    if (sets.length === 0) return err('No fields to update')
    sets.push('updatedAt = ?'); vals.push(nowISO()); vals.push(id)

    await exec(`UPDATE Incident SET ${sets.join(', ')} WHERE id = ?`, vals)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return err(e.message, 500)
  }
}
