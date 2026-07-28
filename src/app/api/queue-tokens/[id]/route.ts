// PATCH /api/queue-tokens/:id — status update
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { queryOne, exec, nowISO } from '@/lib/db'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  WAITING:   ['CALLED', 'CANCELLED'],
  CALLED:    ['SERVING', 'WAITING', 'CANCELLED'],
  SERVING:   ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const { id } = await params
    const body = await req.json() as { status?: string; storeId?: string }

    const storeId = body.storeId ?? req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
    if (!storeId) return err('storeId required')

    const hasAccess = user.stores?.some((s: { id: string }) => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    const token = await queryOne(
      `SELECT * FROM QueueToken WHERE id = ? AND storeId = ?`,
      [id, storeId]
    ) as Record<string, unknown> | null

    if (!token) return err('Token not found', 404)

    const newStatus = body.status
    if (!newStatus) return err('status required')

    const allowed = ALLOWED_TRANSITIONS[token.status as string] ?? []
    if (!allowed.includes(newStatus)) {
      return err(`Cannot transition from ${token.status} to ${newStatus}`)
    }

    const now = nowISO()
    let calledAt = token.calledAt as string | null
    let completedAt = token.completedAt as string | null

    if (newStatus === 'CALLED' || newStatus === 'SERVING') calledAt = calledAt ?? now
    if (newStatus === 'COMPLETED') completedAt = now

    await exec(
      `UPDATE QueueToken SET status = ?, calledAt = ?, completedAt = ? WHERE id = ? AND storeId = ?`,
      [newStatus, calledAt, completedAt, id, storeId]
    )

    return ok({ ...token, status: newStatus, calledAt, completedAt })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    return err(msg, 500)
  }
}
