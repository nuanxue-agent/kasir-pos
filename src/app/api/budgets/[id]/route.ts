// PATCH /api/budgets/[id]
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { queryOne, exec, nowISO } from '@/lib/db'
import { ensureTables } from '../route'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

// PATCH /api/budgets/[id]?storeId=xxx
// Body: { budgetAmount?, actualAmount?, notes? }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const url = new URL(req.url)
    const storeId = url.searchParams.get('storeId')
    if (!storeId) return err('storeId required')

    const hasAccess = user.stores?.some((s: { id: string }) => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    const { id } = await params

    await ensureTables()

    const row = await queryOne<{ id: string; storeId: string }>(
      `SELECT id, storeId FROM Budget WHERE id = ? AND storeId = ?`,
      [id, storeId]
    )
    if (!row) return err('Budget row not found', 404)

    const body = await req.json() as {
      budgetAmount?: number
      actualAmount?: number
      notes?: string
    }

    const setClauses: string[] = []
    const setParams: unknown[] = []

    if (body.budgetAmount != null) { setClauses.push('budgetAmount = ?'); setParams.push(Number(body.budgetAmount)) }
    if (body.actualAmount != null) { setClauses.push('actualAmount = ?'); setParams.push(Number(body.actualAmount)) }
    if (body.notes != null) { setClauses.push('notes = ?'); setParams.push(String(body.notes)) }

    if (setClauses.length === 0) return err('No fields to update')

    const now = nowISO()
    setClauses.push('updatedAt = ?')
    setParams.push(now)
    setParams.push(id)

    await exec(
      `UPDATE Budget SET ${setClauses.join(', ')} WHERE id = ?`,
      setParams
    )

    const updated = await queryOne<Record<string, unknown>>(
      `SELECT * FROM Budget WHERE id = ?`,
      [id]
    )
    return ok(updated)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    return err(msg, 500)
  }
}
