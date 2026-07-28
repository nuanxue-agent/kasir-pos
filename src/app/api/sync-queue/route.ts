// GET /api/sync-queue?storeId=&status=
// POST /api/sync-queue?storeId=
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import type { SyncAction, SyncStatus } from '@/lib/offline-sync'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function ensureSyncTables() {
  await exec(`
    CREATE TABLE IF NOT EXISTS SyncQueue (
      id          TEXT PRIMARY KEY,
      storeId     TEXT NOT NULL,
      action      TEXT NOT NULL,
      payload     TEXT NOT NULL DEFAULT '{}',
      status      TEXT NOT NULL DEFAULT 'PENDING',
      createdAt   TEXT NOT NULL,
      syncedAt    TEXT,
      retryCount  INTEGER NOT NULL DEFAULT 0
    )
  `)
  await exec(`
    CREATE TABLE IF NOT EXISTS SyncConflict (
      id           TEXT PRIMARY KEY,
      syncQueueId  TEXT NOT NULL,
      storeId      TEXT NOT NULL,
      conflictType TEXT NOT NULL,
      localData    TEXT NOT NULL DEFAULT '{}',
      serverData   TEXT NOT NULL DEFAULT '{}',
      resolved     INTEGER NOT NULL DEFAULT 0,
      resolvedAt   TEXT
    )
  `)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const sp = req.nextUrl.searchParams
  const storeId = sp.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureSyncTables()

  const statusFilter = sp.get('status')
  let rows: any[]
  if (statusFilter) {
    rows = await query(
      `SELECT * FROM SyncQueue WHERE storeId = ? AND status = ? ORDER BY createdAt ASC`,
      [storeId, statusFilter],
    )
  } else {
    rows = await query(
      `SELECT * FROM SyncQueue WHERE storeId = ? ORDER BY createdAt ASC`,
      [storeId],
    )
  }

  return NextResponse.json(
    (rows as any[]).map((r) => ({
      ...r,
      payload: JSON.parse(r.payload || '{}'),
      retryCount: Number(r.retryCount),
    })),
  )
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureSyncTables()

  const b = (await req.json()) as any
  if (!b.action) return err("Field 'action' is required", 400, 'MISSING_FIELD')

  const VALID_ACTIONS: SyncAction[] = [
    'CREATE_ORDER',
    'UPDATE_ORDER',
    'UPDATE_STOCK',
    'CREATE_CUSTOMER',
  ]
  if (!VALID_ACTIONS.includes(b.action)) {
    return err(`Invalid action. Must be one of: ${VALID_ACTIONS.join(', ')}`, 400, 'INVALID_FIELD')
  }

  if (!b.payload || typeof b.payload !== 'object') {
    return err("Field 'payload' must be an object", 400, 'MISSING_FIELD')
  }

  const id = newId()
  const t = nowISO()
  await exec(
    `INSERT INTO SyncQueue (id, storeId, action, payload, status, createdAt, syncedAt, retryCount)
     VALUES (?, ?, ?, ?, 'PENDING', ?, NULL, 0)`,
    [id, storeId, b.action, JSON.stringify(b.payload), t],
  )

  return NextResponse.json({ id }, { status: 201 })
}
