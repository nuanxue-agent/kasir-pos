// PATCH /api/sync-queue/[id]
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, nowISO } from '@/lib/db'
import { isValidSyncStatusTransition } from '@/lib/offline-sync'
import { ensureSyncTables } from '../route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')

  const { id } = await params
  await ensureSyncTables()

  const row = (await query(`SELECT * FROM SyncQueue WHERE id = ?`, [id]))[0] as any
  if (!row) return err('Not found', 404, 'NOT_FOUND')

  const b = (await req.json()) as any

  const sets: string[] = []
  const vals: any[] = []

  if (b.status !== undefined) {
    if (!isValidSyncStatusTransition(row.status, b.status)) {
      return err(
        `Invalid status transition: ${row.status} → ${b.status}`,
        400,
        'INVALID_TRANSITION',
      )
    }
    sets.push('status = ?')
    vals.push(b.status)

    if (b.status === 'SYNCED') {
      sets.push('syncedAt = ?')
      vals.push(nowISO())
    }
    if (b.status === 'PENDING' && row.status === 'FAILED') {
      sets.push('retryCount = ?')
      vals.push(Number(row.retryCount) + 1)
    }
  }

  if (b.payload !== undefined) {
    sets.push('payload = ?')
    vals.push(JSON.stringify(b.payload))
  }

  if (sets.length === 0) return err('No fields to update', 400, 'NO_FIELDS')

  vals.push(id)
  await exec(`UPDATE SyncQueue SET ${sets.join(', ')} WHERE id = ?`, vals)

  return NextResponse.json({ ok: true })
}
