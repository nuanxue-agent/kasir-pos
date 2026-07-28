import { NextRequest, NextResponse } from 'next/server'
import { query, exec, newId, nowISO } from '@/lib/db'
import { ensureOrderTrackingTables } from '../route'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

// GET /api/order-tracking/[orderId] — staff lookup by orderId
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const { orderId } = await params

  await ensureOrderTrackingTables()

  const rows = await query(
    `SELECT ot.*, s.name as storeName
     FROM OrderTracking ot
     LEFT JOIN Store s ON s.id = ot.storeId
     WHERE ot.orderId = ?`,
    [orderId],
  ) as any[]

  if (rows.length === 0) return err('Not found', 404)

  const record = rows[0]
  const timeline = await query(
    `SELECT status, timestamp, notes FROM OrderTrackingTimeline WHERE trackingId = ? ORDER BY timestamp ASC`,
    [record.id],
  ) as any[]

  return NextResponse.json({ ...record, timeline })
}

// PATCH /api/order-tracking/[orderId] — staff update status
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const { orderId } = await params

  await ensureOrderTrackingTables()

  const b = await req.json() as any

  // Accept either tracking.id or orderId
  const rows = await query(
    `SELECT * FROM OrderTracking WHERE id = ? OR orderId = ?`,
    [orderId, orderId],
  ) as any[]

  if (rows.length === 0) return err('Not found', 404)

  const record = rows[0]

  const sets: string[] = []
  const vals: any[] = []

  if (b.status !== undefined) {
    sets.push('status = ?')
    vals.push(b.status)
    // Add timeline entry on status change
    if (b.status !== record.status) {
      await exec(
        `INSERT INTO OrderTrackingTimeline (id, trackingId, status, notes, timestamp) VALUES (?, ?, ?, ?, ?)`,
        [newId(), record.id, b.status, b.notes ?? null, nowISO()],
      )
    }
  }

  if (b.estimatedMinutes !== undefined) {
    sets.push('estimatedMinutes = ?')
    vals.push(b.estimatedMinutes)
  }

  if (b.notes !== undefined) {
    sets.push('notes = ?')
    vals.push(b.notes)
  }

  if (sets.length === 0) return err('No fields to update')

  sets.push('updatedAt = ?')
  vals.push(nowISO())
  vals.push(record.id)

  await exec(
    `UPDATE OrderTracking SET ${sets.join(', ')} WHERE id = ?`,
    vals,
  )

  return NextResponse.json({ ok: true })
}
