// POST /api/queue-tokens/call-next — move next WAITING token to CALLED
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { queryOne, exec, nowISO } from '@/lib/db'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const body = await req.json() as { storeId?: string; serviceType?: string }
    const storeId = body.storeId ?? req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
    if (!storeId) return err('storeId required')

    const hasAccess = user.stores?.some((s: { id: string }) => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    const today = nowISO().slice(0, 10)

    let sql = `SELECT * FROM QueueToken
               WHERE storeId = ? AND status = 'WAITING' AND date(joinedAt) = ?`
    const params: unknown[] = [storeId, today]

    if (body.serviceType) {
      sql += ` AND serviceType = ?`
      params.push(body.serviceType)
    }

    sql += ` ORDER BY priority DESC, tokenNumber ASC LIMIT 1`

    const next = await queryOne(sql, params) as Record<string, unknown> | null
    if (!next) return err('No waiting tokens', 404)

    const now = nowISO()
    await exec(
      `UPDATE QueueToken SET status = 'CALLED', calledAt = ? WHERE id = ?`,
      [now, next.id]
    )

    return ok({ ...next, status: 'CALLED', calledAt: now })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    return err(msg, 500)
  }
}
