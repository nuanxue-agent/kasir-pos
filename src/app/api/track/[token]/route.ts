import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { ensureOrderTrackingTables } from '../../order-tracking/route'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

// GET /api/track/[token] — public, no auth required
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params

  await ensureOrderTrackingTables()

  const rows = await query(
    `SELECT ot.*, s.name as storeName
     FROM OrderTracking ot
     LEFT JOIN Store s ON s.id = ot.storeId
     WHERE ot.token = ?`,
    [token],
  ) as any[]

  if (rows.length === 0) return err('Not found', 404)

  const record = rows[0]
  const timeline = await query(
    `SELECT status, timestamp, notes FROM OrderTrackingTimeline WHERE trackingId = ? ORDER BY timestamp ASC`,
    [record.id],
  ) as any[]

  return NextResponse.json({ ...record, timeline })
}
