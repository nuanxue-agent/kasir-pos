// PATCH /api/scheduled-campaigns/[id]
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

async function ensureTables() {
  await exec(`
    CREATE TABLE IF NOT EXISTS ScheduledCampaign (
      id          TEXT PRIMARY KEY,
      storeId     TEXT NOT NULL,
      campaignId  TEXT NOT NULL,
      startAt     TEXT NOT NULL,
      endAt       TEXT,
      status      TEXT NOT NULL DEFAULT 'PENDING',
      autoStart   INTEGER NOT NULL DEFAULT 1,
      autoStop    INTEGER NOT NULL DEFAULT 1,
      createdAt   TEXT NOT NULL,
      updatedAt   TEXT NOT NULL
    )
  `)
}

const VALID_STATUSES = ['PENDING', 'ACTIVE', 'COMPLETED', 'CANCELLED']
const VALID_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')

  await ensureTables()

  const b = (await req.json()) as any

  // Get current record for transition validation
  const current = await query('SELECT status FROM ScheduledCampaign WHERE id = ?', [id])
  if (current.length === 0) return err('Scheduled campaign not found', 404, 'NOT_FOUND')

  const currentStatus = (current[0] as any).status

  const sets: string[] = []
  const vals: any[] = []

  if (b.status !== undefined) {
    if (!VALID_STATUSES.includes(b.status)) {
      return err('Invalid status', 400, 'INVALID_FIELD')
    }
    if (!VALID_TRANSITIONS[currentStatus].includes(b.status)) {
      return err(
        `Cannot transition from ${currentStatus} to ${b.status}`,
        400,
        'INVALID_TRANSITION'
      )
    }
    sets.push('status = ?')
    vals.push(b.status)
  }

  if (b.startAt !== undefined) {
    const d = new Date(b.startAt)
    if (isNaN(d.getTime())) return err('Invalid startAt date', 400, 'INVALID_FIELD')
    sets.push('startAt = ?')
    vals.push(b.startAt)
  }

  if (b.endAt !== undefined) {
    if (b.endAt === null) {
      sets.push('endAt = NULL')
    } else {
      const d = new Date(b.endAt)
      if (isNaN(d.getTime())) return err('Invalid endAt date', 400, 'INVALID_FIELD')
      sets.push('endAt = ?')
      vals.push(b.endAt)
    }
  }

  if (b.autoStart !== undefined) {
    sets.push('autoStart = ?')
    vals.push(b.autoStart ? 1 : 0)
  }

  if (b.autoStop !== undefined) {
    sets.push('autoStop = ?')
    vals.push(b.autoStop ? 1 : 0)
  }

  if (sets.length === 0) return err('No fields to update')

  sets.push('updatedAt = ?')
  vals.push(nowISO())
  vals.push(id)

  await exec(`UPDATE ScheduledCampaign SET ${sets.join(', ')} WHERE id = ?`, vals)

  return NextResponse.json({ ok: true })
}
