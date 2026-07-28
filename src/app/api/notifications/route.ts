// GET /api/notifications?storeId= — returns unread in-app notifications
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'
import { ensureNotificationTables } from '../notification-rules/route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureNotificationTables()

  const rows = await query(
    `SELECT * FROM NotificationLog
     WHERE storeId = ? AND channel = 'IN_APP' AND read = 0
     ORDER BY createdAt DESC
     LIMIT 50`,
    [storeId],
  )

  const notifications = (rows as any[]).map(r => ({
    ...r,
    read: Boolean(r.read),
  }))

  return NextResponse.json(notifications)
}
