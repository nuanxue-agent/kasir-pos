// POST /api/notifications/[id]/read — mark a single notification as read
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { exec } from '@/lib/db'
import { ensureNotificationTables } from '../../../notification-rules/route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')

  const { id } = await params
  await ensureNotificationTables()

  await exec(`UPDATE NotificationLog SET read = 1 WHERE id = ?`, [id])
  return NextResponse.json({ ok: true })
}
