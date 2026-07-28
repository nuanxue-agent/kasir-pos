// API route: PATCH /api/kpi-goals/:id
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { queryOne, exec } from '@/lib/db'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)
  const user = session.user as any
  const storeIds: string[] = user.stores?.map((s: any) => s.id) ?? []

  const { searchParams } = new URL(req.url)
  const storeId = searchParams.get('storeId') ?? user.stores?.[0]?.id ?? ''
  if (!storeId || !storeIds.includes(storeId)) return err('Store not found', 403)

  const { id } = await params

  const existing = await queryOne<any>(
    `SELECT * FROM KpiGoal WHERE id = ? AND storeId = ?`,
    [id, storeId],
  )
  if (!existing) return err('KPI goal not found', 404)

  try {
    const b = (await req.json()) as any
    const updates: Record<string, any> = {}

    if (b.target !== undefined) {
      const target = Number(b.target)
      if (!Number.isFinite(target) || target <= 0) return err('Target must be a positive number', 400)
      updates.target = target
    }
    if (b.actual !== undefined) {
      const actual = Number(b.actual)
      if (!Number.isFinite(actual) || actual < 0) return err('Actual must be non-negative', 400)
      updates.actual = actual
    }
    if (b.metric !== undefined) {
      const VALID = ['REVENUE', 'ORDERS', 'CUSTOMERS', 'AVG_ORDER', 'REPEAT_RATE']
      if (!VALID.includes(b.metric)) return err('Invalid metric', 400)
      updates.metric = b.metric
    }

    if (Object.keys(updates).length === 0) return err('Nothing to update', 400)

    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ')
    await exec(
      `UPDATE KpiGoal SET ${setClauses} WHERE id = ? AND storeId = ?`,
      [...Object.values(updates), id, storeId],
    )

    return NextResponse.json({ updated: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Internal error' }, { status: 500 })
  }
}
