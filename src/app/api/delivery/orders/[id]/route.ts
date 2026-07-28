import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { queryOne, exec, nowISO } from '@/lib/db'

function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status })
}
function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

async function getStoreId(req: NextRequest): Promise<string | null> {
  const session = await auth()
  if (!session?.user) return null
  const user = session.user as { stores?: { id: string }[] }
  const urlStoreId = new URL(req.url).searchParams.get('storeId')
  if (urlStoreId) {
    const hasAccess = user.stores?.some(s => s.id === urlStoreId) ?? false
    return hasAccess ? urlStoreId : null
  }
  return user.stores?.[0]?.id ?? null
}

const VALID_STATUSES = ['PENDING', 'ASSIGNED', 'PICKED_UP', 'DELIVERED', 'FAILED'] as const
type DeliveryStatus = (typeof VALID_STATUSES)[number]

const VALID_TRANSITIONS: Record<DeliveryStatus, DeliveryStatus[]> = {
  PENDING: ['ASSIGNED', 'FAILED'],
  ASSIGNED: ['PICKED_UP', 'FAILED'],
  PICKED_UP: ['DELIVERED', 'FAILED'],
  DELIVERED: [],
  FAILED: [],
}

// PATCH /api/delivery/orders/:id
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)

    const storeId = await getStoreId(req)
    if (!storeId) return err('Forbidden', 403)

    const { id } = await params
    const body = (await req.json()) as Record<string, unknown>

    const existing = (await queryOne(
      `SELECT * FROM DeliveryOrder WHERE id = ? AND storeId = ?`,
      [id, storeId],
    )) as Record<string, unknown> | null

    if (!existing) return err('Delivery order not found', 404)

    const currentStatus = existing.status as DeliveryStatus

    if (body.status) {
      const newStatus = body.status as DeliveryStatus
      if (!VALID_STATUSES.includes(newStatus)) return err('Invalid status')
      const allowed = VALID_TRANSITIONS[currentStatus]
      if (!allowed.includes(newStatus)) {
        return err(`Cannot transition from ${currentStatus} to ${newStatus}`)
      }
    }

    const t = nowISO()
    const updates: string[] = ['updatedAt = ?']
    const values: unknown[] = [t]

    if (body.status !== undefined) { updates.push('status = ?'); values.push(body.status) }
    if (body.courierId !== undefined) { updates.push('courierId = ?'); values.push(body.courierId) }
    if (body.estimatedAt !== undefined) { updates.push('estimatedAt = ?'); values.push(body.estimatedAt) }
    if (body.deliveredAt !== undefined) { updates.push('deliveredAt = ?'); values.push(body.deliveredAt) }
    if (body.notes !== undefined) { updates.push('notes = ?'); values.push(body.notes) }

    values.push(id, storeId)
    await exec(
      `UPDATE DeliveryOrder SET ${updates.join(', ')} WHERE id = ? AND storeId = ?`,
      values,
    )

    return ok({ id, ...body, updatedAt: t })
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
