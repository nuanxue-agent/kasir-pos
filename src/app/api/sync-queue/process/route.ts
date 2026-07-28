// POST /api/sync-queue/process?storeId=
// Processes all PENDING items in FIFO order, marks SYNCED or FAILED
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import { ensureSyncTables } from '../route'
import { hasConflict, detectConflictType, MAX_RETRY_COUNT } from '@/lib/offline-sync'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureSyncTables()

  // Fetch PENDING items in FIFO order
  const pending = (await query(
    `SELECT * FROM SyncQueue WHERE storeId = ? AND status = 'PENDING' ORDER BY createdAt ASC`,
    [storeId],
  )) as any[]

  if (pending.length === 0) {
    return NextResponse.json({ processed: 0, synced: 0, failed: 0, conflicts: 0 })
  }

  let synced = 0
  let failed = 0
  let conflicts = 0
  const t = nowISO()

  for (const item of pending) {
    try {
      const payload = JSON.parse(item.payload || '{}') as Record<string, unknown>

      // Simulate server-side processing by action type.
      // In production this would call the real domain APIs.
      // For now: detect conflicts if serverData is provided in payload,
      // otherwise mark as SYNCED.
      const serverData = (payload._serverData as Record<string, unknown> | null) ?? null

      if (serverData !== null && hasConflict(payload, serverData)) {
        // Create conflict record
        const conflictId = newId()
        const conflictType = detectConflictType(payload, serverData)
        await exec(
          `INSERT INTO SyncConflict (id, syncQueueId, storeId, conflictType, localData, serverData, resolved, resolvedAt)
           VALUES (?, ?, ?, ?, ?, ?, 0, NULL)`,
          [
            conflictId,
            item.id,
            storeId,
            conflictType,
            JSON.stringify(payload),
            JSON.stringify(serverData),
          ],
        )

        // Mark item as FAILED with incremented retryCount
        const newRetry = Number(item.retryCount) + 1
        const newStatus = newRetry >= MAX_RETRY_COUNT ? 'FAILED' : 'PENDING'
        await exec(
          `UPDATE SyncQueue SET status = ?, retryCount = ? WHERE id = ?`,
          [newStatus, newRetry, item.id],
        )
        conflicts++
        if (newStatus === 'FAILED') failed++
      } else {
        // No conflict — mark as SYNCED
        await exec(
          `UPDATE SyncQueue SET status = 'SYNCED', syncedAt = ? WHERE id = ?`,
          [t, item.id],
        )
        synced++
      }
    } catch {
      // Mark as FAILED on unexpected error
      const newRetry = Number(item.retryCount) + 1
      await exec(
        `UPDATE SyncQueue SET status = 'FAILED', retryCount = ? WHERE id = ?`,
        [newRetry, item.id],
      )
      failed++
    }
  }

  return NextResponse.json({
    processed: pending.length,
    synced,
    failed,
    conflicts,
  })
}
