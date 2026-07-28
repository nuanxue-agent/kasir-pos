// GET /api/security-events/summary
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'
import { ensureSecurityEventTables } from '../route'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

// GET /api/security-events/summary?storeId=&period=7d|30d|90d
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const sp = req.nextUrl.searchParams
    const storeId = sp.get('storeId') ?? user.stores?.[0]?.id
    if (!storeId) return err('storeId required')

    const hasAccess = (user.stores as any[])?.some((s: { id: string }) => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    const role = (user.stores as any[])?.find((s: { id: string }) => s.id === storeId)?.role ?? ''
    if (!['OWNER', 'SUPERADMIN'].includes(role)) return err('Forbidden', 403)

    await ensureSecurityEventTables()

    // Determine period
    const periodParam = sp.get('period') ?? '30d'
    const daysMap: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 }
    const days = daysMap[periodParam] ?? 30
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

    // Counts by type
    const byType = await query(
      `SELECT type, COUNT(*) as count
       FROM SecurityEvent
       WHERE storeId = ? AND createdAt >= ?
       GROUP BY type
       ORDER BY count DESC`,
      [storeId, since],
    )

    // Counts by severity
    const bySeverity = await query(
      `SELECT severity, COUNT(*) as count
       FROM SecurityEvent
       WHERE storeId = ? AND createdAt >= ?
       GROUP BY severity
       ORDER BY severity`,
      [storeId, since],
    )

    // Daily breakdown (last N days)
    const byDay = await query(
      `SELECT substr(createdAt, 1, 10) as date, COUNT(*) as count
       FROM SecurityEvent
       WHERE storeId = ? AND createdAt >= ?
       GROUP BY date
       ORDER BY date ASC`,
      [storeId, since],
    )

    // Top users with security events
    const byUser = await query(
      `SELECT userId, COUNT(*) as count
       FROM SecurityEvent
       WHERE storeId = ? AND createdAt >= ? AND userId IS NOT NULL
       GROUP BY userId
       ORDER BY count DESC
       LIMIT 10`,
      [storeId, since],
    )

    // High severity events count
    const highSeverityRows = await query(
      `SELECT COUNT(*) as count
       FROM SecurityEvent
       WHERE storeId = ? AND severity = 'HIGH' AND createdAt >= ?`,
      [storeId, since],
    )
    const highSeverityCount = Number((highSeverityRows as any[])[0]?.count ?? 0)

    // Total count
    const totalRows = await query(
      `SELECT COUNT(*) as count FROM SecurityEvent WHERE storeId = ? AND createdAt >= ?`,
      [storeId, since],
    )
    const total = Number((totalRows as any[])[0]?.count ?? 0)

    return ok({
      period: periodParam,
      days,
      since,
      total,
      highSeverityCount,
      byType: (byType as any[]).map(r => ({ type: r.type, count: Number(r.count) })),
      bySeverity: (bySeverity as any[]).map(r => ({ severity: r.severity, count: Number(r.count) })),
      byDay: (byDay as any[]).map(r => ({ date: r.date, count: Number(r.count) })),
      byUser: (byUser as any[]).map(r => ({ userId: r.userId, count: Number(r.count) })),
    })
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500)
  }
}
