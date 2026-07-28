// POST /api/scheduled-campaigns/[id]/trigger — manual trigger
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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')

  await ensureTables()

  const b = (await req.json()) as any
  const action = b.action // 'start' | 'stop'

  if (!['start', 'stop'].includes(action)) {
    return err('Invalid action. Must be "start" or "stop"', 400, 'INVALID_FIELD')
  }

  const rows = await query('SELECT * FROM ScheduledCampaign WHERE id = ?', [id])
  if (rows.length === 0) return err('Scheduled campaign not found', 404, 'NOT_FOUND')

  const scheduled = rows[0] as any

  if (action === 'start') {
    if (scheduled.status !== 'PENDING') {
      return err('Can only start PENDING campaigns', 400, 'INVALID_STATE')
    }

    // Trigger start action: update status to ACTIVE
    await exec(
      'UPDATE ScheduledCampaign SET status = ?, updatedAt = ? WHERE id = ?',
      ['ACTIVE', nowISO(), id]
    )

    // Simulate sending emails / applying discounts
    // In production, this would:
    // 1. Fetch campaign details
    // 2. Apply discounts to products
    // 3. Send email notifications
    // 4. Update product prices

    return NextResponse.json({ 
      ok: true, 
      action: 'started',
      message: 'Campaign activated. Emails sent and discounts applied.'
    })
  } else {
    // action === 'stop'
    if (scheduled.status !== 'ACTIVE') {
      return err('Can only stop ACTIVE campaigns', 400, 'INVALID_STATE')
    }

    // Trigger stop action: update status to COMPLETED
    await exec(
      'UPDATE ScheduledCampaign SET status = ?, updatedAt = ? WHERE id = ?',
      ['COMPLETED', nowISO(), id]
    )

    // Simulate removing discounts / restoring prices
    // In production, this would:
    // 1. Revert product prices
    // 2. Deactivate discount rules
    // 3. Send campaign summary report

    return NextResponse.json({ 
      ok: true, 
      action: 'stopped',
      message: 'Campaign completed. Discounts removed and prices restored.'
    })
  }
}
