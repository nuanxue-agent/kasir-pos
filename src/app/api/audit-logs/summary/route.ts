// GET /api/audit-logs/summary?storeId=&period=7|30|90
// Returns heatmap data: per-user-per-day action counts + suspicious activity flags
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'
import { ensureAuditTable } from '@/lib/audit-query'
import { buildHeatmap, detectSuspiciousActivity, type AuditLogEntry } from '@/lib/audit-logic'

function ok(data: unknown) {
  return NextResponse.json(data)
}
function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)

  const user = session.user as any
  const storeIds: string[] = user.stores?.map((s: any) => s.id) ?? []

  const { searchParams } = new URL(req.url)
  const storeId = searchParams.get('storeId') ?? ''
  const period  = Math.min(90, Math.max(7, parseInt(searchParams.get('period') ?? '30', 10)))

  if (!storeId || !storeIds.includes(storeId)) return err('Store not found', 403)

  await ensureAuditTable()

  try {
    const since = new Date(Date.now() - period * 86_400_000).toISOString()

    const rows = await query<any>(
      `SELECT al.*, u.name as userName
       FROM AuditLog al
       LEFT JOIN User u ON al.userId = u.id
       WHERE al.storeId = ? AND al.createdAt >= ?
       ORDER BY al.createdAt DESC`,
      [storeId, since],
    )

    const entries: AuditLogEntry[] = rows.map((r: any) => ({
      ...r,
      meta: r.meta
        ? (() => { try { return JSON.parse(r.meta) } catch { return null } })()
        : null,
    }))

    // Action type breakdown
    const actionCounts: Record<string, number> = {}
    for (const e of entries) {
      actionCounts[e.action] = (actionCounts[e.action] ?? 0) + 1
    }

    return ok({
      period,
      total: entries.length,
      heatmap: buildHeatmap(entries),
      suspiciousFlags: detectSuspiciousActivity(entries),
      actionBreakdown: actionCounts,
    })
  } catch (e: any) {
    console.error('[audit-logs/summary] GET error:', e)
    return err(`Failed to fetch audit summary: ${e.message}`, 500)
  }
}
