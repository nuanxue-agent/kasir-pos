// PATCH /api/budget-plans/[id]
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, nowISO } from '@/lib/db'
import { ensureTables, BudgetPlan, BudgetPlanStatus } from '../route'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

const VALID_STATUSES: BudgetPlanStatus[] = ['DRAFT', 'APPROVED', 'LOCKED']

// PATCH /api/budget-plans/[id]?storeId=xxx
// Body: { name?, status?, approvedBy? }
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

    await ensureTables()

    const { id } = await params
    const rows = await query<BudgetPlan>(
      `SELECT * FROM BudgetPlan WHERE id = ? AND storeId = ?`,
      [id, storeId]
    )
    if ((rows as any[]).length === 0) return err('Budget plan not found', 404)
    const plan = (rows as any[])[0] as BudgetPlan

    if (plan.status === 'LOCKED') return err('Cannot modify a locked budget plan')

    const body = await req.json() as any
    const now = nowISO()

    const name = body.name != null ? String(body.name) : plan.name
    let status: BudgetPlanStatus = plan.status
    let approvedBy: string | null = plan.approvedBy
    let approvedAt: string | null = plan.approvedAt

    if (body.status != null) {
      if (!VALID_STATUSES.includes(body.status)) return err('invalid status')
      status = body.status as BudgetPlanStatus
      if (status === 'APPROVED') {
        approvedBy = body.approvedBy ?? (user.name ?? user.email ?? null)
        approvedAt = now
      }
    }

    await exec(
      `UPDATE BudgetPlan SET name = ?, status = ?, approvedBy = ?, approvedAt = ?, updatedAt = ? WHERE id = ?`,
      [name, status, approvedBy, approvedAt, now, id]
    )

    return ok({ ...plan, name, status, approvedBy, approvedAt, updatedAt: now })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    return err(msg, 500)
  }
}
