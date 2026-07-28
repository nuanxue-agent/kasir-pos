// POST /api/notifications/mark-all-read?storeId= — mark all in-app notifications as read
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { exec } from '@/lib/db'
import { ensureNotificationTables } from '../../notification-rules/route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureNotificationTables()

  await exec(
    `UPDATE NotificationLog SET read = 1 WHERE storeId = ? AND channel = 'IN_APP'`,
    [storeId],
  )
  return NextResponse.json({ ok: true })
}
