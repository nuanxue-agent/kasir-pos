import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function ensureOrderTrackingTables() {
  await exec(`CREATE TABLE IF NOT EXISTS OrderTracking (
    id               TEXT PRIMARY KEY,
    orderId          TEXT NOT NULL,
    storeId          TEXT NOT NULL,
    token            TEXT NOT NULL UNIQUE,
    status           TEXT NOT NULL DEFAULT 'PENDING',
    estimatedMinutes INTEGER,
    notes            TEXT,
    createdAt        TEXT NOT NULL,
    updatedAt        TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS OrderTrackingTimeline (
    id          TEXT PRIMARY KEY,
    trackingId  TEXT NOT NULL,
    status      TEXT NOT NULL,
    notes       TEXT,
    timestamp   TEXT NOT NULL
  )`)
}

// GET /api/order-tracking?storeId=xxx&status=xxx
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)
  const user = session.user as any

  const sp = req.nextUrl.searchParams
  const storeId = sp.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400)

  await ensureOrderTrackingTables()

  const statusFilter = sp.get('status')
  const params: any[] = [storeId]
  let where = 'WHERE ot.storeId = ?'
  if (statusFilter) {
    where += ' AND ot.status = ?'
    params.push(statusFilter)
  }

  const rows = await query(
    `SELECT ot.*, s.name as storeName
     FROM OrderTracking ot
     LEFT JOIN Store s ON s.id = ot.storeId
     ${where}
     ORDER BY ot.updatedAt DESC`,
    params,
  ) as any[]

  // Attach timeline entries
  const ids = rows.map(r => r.id)
  let timeline: any[] = []
  if (ids.length > 0) {
    timeline = await query(
      `SELECT * FROM OrderTrackingTimeline WHERE trackingId IN (${ids.map(() => '?').join(',')}) ORDER BY timestamp ASC`,
      ids,
    ) as any[]
  }

  const timelineByTracking: Record<string, any[]> = {}
  for (const t of timeline) {
    if (!timelineByTracking[t.trackingId]) timelineByTracking[t.trackingId] = []
    timelineByTracking[t.trackingId].push({ status: t.status, timestamp: t.timestamp, notes: t.notes })
  }

  const result = rows.map(r => ({ ...r, timeline: timelineByTracking[r.id] ?? [] }))
  return NextResponse.json(result)
}

// POST /api/order-tracking?storeId=xxx
// Body: { orderId, estimatedMinutes?, notes? }
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400)

  await ensureOrderTrackingTables()

  const b = await req.json() as any
  if (!b.orderId) return err("Field 'orderId' is required", 400)

  // Generate URL-safe token
  const tokenBytes = new Uint8Array(24)
  crypto.getRandomValues(tokenBytes)
  const token = btoa(String.fromCharCode(...tokenBytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')

  const now = nowISO()
  const id = newId()

  await exec(
    `INSERT INTO OrderTracking (id, orderId, storeId, token, status, estimatedMinutes, notes, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, 'PENDING', ?, ?, ?, ?)`,
    [id, b.orderId, storeId, token, b.estimatedMinutes ?? null, b.notes ?? null, now, now],
  )

  // Seed initial timeline entry
  await exec(
    `INSERT INTO OrderTrackingTimeline (id, trackingId, status, notes, timestamp) VALUES (?, ?, 'PENDING', ?, ?)`,
    [newId(), id, b.notes ?? null, now],
  )

  return NextResponse.json({ id, token, orderId: b.orderId }, { status: 201 })
}
