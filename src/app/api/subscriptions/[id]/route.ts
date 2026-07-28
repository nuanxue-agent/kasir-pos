// PATCH /api/subscriptions/:id
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { exec, nowISO } from '@/lib/db'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

function buildUpdate(cols: Record<string, any>): { setClauses: string; values: any[] } {
  const setClauses = Object.keys(cols)
    .map(k => `${k} = ?`)
    .join(', ')
  const values = Object.values(cols)
  return { setClauses, values }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400)

  const { id: subId } = await params
  const b = (await req.json()) as any
  const t = nowISO()
  const updates: Record<string, any> = { updatedAt: t }
  const allowed = ['status', 'nextBillingAt', 'endDate', 'autoRenew', 'cancelledAt']
  for (const k of allowed) {
    if (b[k] !== undefined) updates[k] = b[k]
  }
  if (b.status === 'CANCELLED' && !updates.cancelledAt) updates.cancelledAt = t
  if (Object.keys(updates).length === 1) return err('Nothing to update')
  const { setClauses, values } = buildUpdate(updates)
  await exec(`UPDATE CustomerSubscription SET ${setClauses} WHERE id=? AND storeId=?`, [
    ...values,
    subId,
    storeId,
  ])
  return NextResponse.json({ updated: true })
}
