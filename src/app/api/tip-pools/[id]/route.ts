// PATCH /api/tip-pools/[id]
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { queryOne, exec, nowISO } from '@/lib/db'
import { ensureTables } from '../route'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

// PATCH /api/tip-pools/[id]?storeId=
// Body: { totalTips?, status? }
export async function PATCH(
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

    const pool = await queryOne<{ id: string; storeId: string; status: string }>(
      `SELECT id, storeId, status FROM TipPool WHERE id = ? AND storeId = ?`,
      [id, storeId]
    )
    if (!pool) return err('Tip pool not found', 404)
    if (pool.status === 'CLOSED') return err('Cannot modify closed tip pool')

    const b = (await req.json()) as any
    const sets: string[] = []
    const vals: any[] = []

    if (b.totalTips !== undefined) {
      if (typeof b.totalTips !== 'number' || b.totalTips < 0) return err('totalTips must be a non-negative number')
      sets.push('totalTips = ?')
      vals.push(b.totalTips)
    }

    if (b.status !== undefined) {
      if (!['OPEN', 'CLOSED'].includes(b.status)) return err("status must be 'OPEN' or 'CLOSED'")
      sets.push('status = ?')
      vals.push(b.status)
      if (b.status === 'CLOSED') {
        sets.push('closedAt = ?')
        vals.push(nowISO())
      }
    }

    if (sets.length === 0) return err('No fields to update')

    sets.push('updatedAt = ?')
    vals.push(nowISO())
    vals.push(id)

    await exec(`UPDATE TipPool SET ${sets.join(', ')} WHERE id = ?`, vals)
    return ok({ ok: true })
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
