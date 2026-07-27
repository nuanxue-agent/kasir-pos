import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

/**
 * GET /api/notifications/unread-count?storeId=<id>
 *
 * Returns the count of unread in-app notifications for the authenticated user.
 * Notifications are stored client-side in localStorage, so this endpoint
 * provides a server-authoritative count that can be used for SSR badges and
 * cross-device sync. For now it derives the count from the low-stock alerts
 * which are the primary server-generated notification source.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const storeId = searchParams.get('storeId')

    if (!storeId) {
      return NextResponse.json({ count: 0 })
    }

    // Count low-stock products as the server-side unread signal
    // In a full implementation this would query a Notifications table
    const { query } = await import('@/lib/db')
    const rows = await query<{ cnt: number }>(
      `SELECT COUNT(*) as cnt
       FROM Product
       WHERE storeId = ?
         AND active = 1
         AND stock IS NOT NULL
         AND lowStock IS NOT NULL
         AND stock <= lowStock`,
      [storeId],
    )

    const count = rows[0]?.cnt ?? 0
    return NextResponse.json({ count, storeId })
  } catch (err) {
    console.error('[unread-count]', err)
    return NextResponse.json({ count: 0 })
  }
}
