// PATCH /api/notification-rules/[id]
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { exec, nowISO } from '@/lib/db'
import { ensureNotificationTables } from '../route'

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
  await ensureNotificationTables()

  const b = (await req.json()) as any

  const sets: string[] = []
  const vals: any[] = []

  if (b.event !== undefined) { sets.push('event = ?'); vals.push(b.event) }
  if (b.channel !== undefined) { sets.push('channel = ?'); vals.push(b.channel) }
  if (b.threshold !== undefined) { sets.push('threshold = ?'); vals.push(b.threshold) }
  if (b.active !== undefined) { sets.push('active = ?'); vals.push(b.active ? 1 : 0) }

  if (sets.length === 0) return err('No fields to update')

  sets.push('updatedAt = ?')
  vals.push(nowISO())
  vals.push(id)

  await exec(`UPDATE NotificationRule SET ${sets.join(', ')} WHERE id = ?`, vals)
  return NextResponse.json({ ok: true })
}
