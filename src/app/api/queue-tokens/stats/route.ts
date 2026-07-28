// GET /api/queue-tokens/stats — avg wait time, queue length
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'

function ok(data: unknown) { return NextResponse.json(data) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const url = new URL(req.url)
    const storeId = url.searchParams.get('storeId')
    if (!storeId) return err('storeId required')

    const hasAccess = user.stores?.some((s: { id: string }) => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    const date = url.searchParams.get('date') ?? new Date().toISOString().slice(0, 10)

    // Count by status
    const statusCounts = await query<{ status: string; count: number }>(
      `SELECT status, COUNT(*) as count FROM QueueToken
       WHERE storeId = ? AND date(joinedAt) = ?
       GROUP BY status`,
      [storeId, date]
    )

    const counts: Record<string, number> = {}
    for (const row of statusCounts) {
      counts[row.status] = Number(row.count)
    }

    // Avg service time from completed tokens (calledAt → completedAt) in minutes
    const completedRows = await query<{ calledAt: string; completedAt: string }>(
      `SELECT calledAt, completedAt FROM QueueToken
       WHERE storeId = ? AND status = 'COMPLETED' AND date(joinedAt) = ?
         AND calledAt IS NOT NULL AND completedAt IS NOT NULL`,
      [storeId, date]
    )

    let avgServiceMinutes = 10 // default fallback
    if (completedRows.length > 0) {
      const totalMs = completedRows.reduce((acc, row) => {
        return acc + (new Date(row.completedAt).getTime() - new Date(row.calledAt).getTime())
      }, 0)
      avgServiceMinutes = Math.round(totalMs / completedRows.length / 60000)
    }

    const waitingCount = counts['WAITING'] ?? 0
    const servingCount = counts['SERVING'] ?? 0
    const calledCount  = counts['CALLED']  ?? 0

    // Estimated wait = waitingCount / max(serving+called, 1) * avgServiceMinutes
    const activeWindows = Math.max(servingCount + calledCount, 1)
    const estimatedWaitMinutes = Math.round((waitingCount / activeWindows) * avgServiceMinutes)

    return ok({
      date,
      waiting:  waitingCount,
      called:   calledCount,
      serving:  servingCount,
      completed: counts['COMPLETED'] ?? 0,
      cancelled: counts['CANCELLED'] ?? 0,
      avgServiceMinutes,
      estimatedWaitMinutes,
      totalToday: Object.values(counts).reduce((a, b) => a + b, 0),
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    return err(msg, 500)
  }
}
