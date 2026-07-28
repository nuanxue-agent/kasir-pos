// POST /api/sync-conflicts/[id]/resolve
// Body: { resolution: 'USE_LOCAL' | 'USE_SERVER' | 'MANUAL', mergedData?: object }
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, nowISO } from '@/lib/db'
import { ensureSyncTables } from '../../../sync-queue/route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')

  const { id } = await params
  await ensureSyncTables()

  const rows = await query(`SELECT * FROM SyncConflict WHERE id = ?`, [id])
  const conflict = (rows as any[])[0]
  if (!conflict) return err('Conflict not found', 404, 'NOT_FOUND')
  if (Boolean(conflict.resolved)) return err('Conflict already resolved', 400, 'ALREADY_RESOLVED')

  const b = (await req.json()) as any
  const VALID_RESOLUTIONS = ['USE_LOCAL', 'USE_SERVER', 'MANUAL']
  if (!b.resolution || !VALID_RESOLUTIONS.includes(b.resolution)) {
    return err(
      `resolution must be one of: ${VALID_RESOLUTIONS.join(', ')}`,
      400,
      'INVALID_FIELD',
    )
  }

  const t = nowISO()

  // Mark conflict as resolved
  await exec(
    `UPDATE SyncConflict SET resolved = 1, resolvedAt = ? WHERE id = ?`,
    [t, id],
  )

  // Determine what payload to use for re-queue
  let finalPayload: Record<string, unknown>
  if (b.resolution === 'USE_LOCAL') {
    finalPayload = JSON.parse(conflict.localData || '{}') as Record<string, unknown>
  } else if (b.resolution === 'USE_SERVER') {
    finalPayload = JSON.parse(conflict.serverData || '{}') as Record<string, unknown>
  } else {
    // MANUAL — caller provides mergedData
    if (!b.mergedData || typeof b.mergedData !== 'object') {
      return err("mergedData is required for MANUAL resolution", 400, 'MISSING_FIELD')
    }
    finalPayload = b.mergedData as Record<string, unknown>
  }

  // Reset the SyncQueue item to PENDING with the chosen payload
  await exec(
    `UPDATE SyncQueue SET status = 'PENDING', payload = ?, retryCount = 0 WHERE id = ?`,
    [JSON.stringify(finalPayload), conflict.syncQueueId],
  )

  return NextResponse.json({ ok: true, resolution: b.resolution })
}
