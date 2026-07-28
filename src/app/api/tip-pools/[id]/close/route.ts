// POST /api/tip-pools/[id]/close
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { queryOne, query, exec, nowISO } from '@/lib/db'
import { ensureTables } from '../../route'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

// POST /api/tip-pools/[id]/close?storeId=
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const url = new URL(req.url)
    const storeId = url.searchParams.get('storeId') ?? user.stores?.[0]?.id
    if (!storeId) return err('storeId required')

    const hasAccess = user.stores?.some((s: { id: string }) => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    const { id } = await params
    await ensureTables()

    const pool = await queryOne<{ id: string; storeId: string; totalTips: number; status: string }>(
      `SELECT id, storeId, totalTips, status FROM TipPool WHERE id = ? AND storeId = ?`,
      [id, storeId]
    )
    if (!pool) return err('Tip pool not found', 404)
    if (pool.status === 'CLOSED') return err('Tip pool is already closed')

    // Verify distributions exist and total matches
    const distributions = await query<{ amount: number }>(
      `SELECT amount FROM TipDistribution WHERE poolId = ?`,
      [id]
    )
    if (distributions.length === 0) {
      return err('Cannot close pool with no distributions — distribute tips first')
    }

    const distribTotal = distributions.reduce((s, d) => s + d.amount, 0)
    if (Math.abs(distribTotal - pool.totalTips) > 0.02) {
      return err(
        `Distribution total ${distribTotal.toFixed(2)} does not match pool totalTips ${pool.totalTips} — re-distribute before closing`
      )
    }

    const now = nowISO()
    await exec(
      `UPDATE TipPool SET status = 'CLOSED', closedAt = ?, updatedAt = ? WHERE id = ?`,
      [now, now, id]
    )

    return ok({ ok: true, closedAt: now })
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
