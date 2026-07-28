// GET /api/sync-conflicts?storeId=&resolved=
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'
import { ensureSyncTables } from '../sync-queue/route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export { ensureSyncTables }

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const sp = req.nextUrl.searchParams
  const storeId = sp.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureSyncTables()

  const resolvedParam = sp.get('resolved')
  let rows: any[]

  if (resolvedParam !== null) {
    const resolvedVal = resolvedParam === 'true' ? 1 : 0
    rows = await query(
      `SELECT c.*, q.action, q.createdAt as queuedAt
       FROM SyncConflict c
       LEFT JOIN SyncQueue q ON c.syncQueueId = q.id
       WHERE c.storeId = ? AND c.resolved = ?
       ORDER BY c.id DESC`,
      [storeId, resolvedVal],
    )
  } else {
    rows = await query(
      `SELECT c.*, q.action, q.createdAt as queuedAt
       FROM SyncConflict c
       LEFT JOIN SyncQueue q ON c.syncQueueId = q.id
       WHERE c.storeId = ?
       ORDER BY c.id DESC`,
      [storeId],
    )
  }

  return NextResponse.json(
    (rows as any[]).map((r) => ({
      ...r,
      localData: JSON.parse(r.localData || '{}'),
      serverData: JSON.parse(r.serverData || '{}'),
      resolved: Boolean(r.resolved),
    })),
  )
}
