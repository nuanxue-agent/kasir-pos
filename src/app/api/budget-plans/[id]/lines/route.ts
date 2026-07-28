// GET/POST /api/budget-plans/[id]/lines
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import { ensureTables } from '../../route'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

export type BudgetLineCategory = 'REVENUE' | 'EXPENSE'

export interface BudgetLine {
  id: string
  planId: string
  storeId: string
  accountCode: string
  accountName: string
  category: BudgetLineCategory
  q1: number
  q2: number
  q3: number
  q4: number
  annual: number
  actualQ1: number
  actualQ2: number
  actualQ3: number
  actualQ4: number
  actualAnnual: number
  createdAt: string
  updatedAt: string
}

// GET /api/budget-plans/[id]/lines?storeId=xxx
export async function GET(
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

    const { id: planId } = await params

    // verify plan belongs to store
    const plans = await query<{ id: string }>(
      `SELECT id FROM BudgetPlan WHERE id = ? AND storeId = ?`,
      [planId, storeId]
    )
    if ((plans as any[]).length === 0) return err('Budget plan not found', 404)

    const lines = await query<BudgetLine>(
      `SELECT * FROM BudgetLine WHERE planId = ? ORDER BY category ASC, accountCode ASC`,
      [planId]
    )
    return ok(lines)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    return err(msg, 500)
  }
}

// POST /api/budget-plans/[id]/lines?storeId=xxx
// Body: { accountCode, accountName, category, q1, q2, q3, q4, annual?, actualQ1?, actualQ2?, actualQ3?, actualQ4?, actualAnnual? }
export async function POST(
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

    const { id: planId } = await params

    const plans = await query<{ id: string; status: string }>(
      `SELECT id, status FROM BudgetPlan WHERE id = ? AND storeId = ?`,
      [planId, storeId]
    )
    if ((plans as any[]).length === 0) return err('Budget plan not found', 404)
    const plan = (plans as any[])[0]
    if (plan.status === 'LOCKED') return err('Cannot modify a locked budget plan')

    const body = await req.json() as any
    if (!body.category) return err('category required')
    if (!(['REVENUE', 'EXPENSE'] as BudgetLineCategory[]).includes(body.category)) {
      return err('category must be REVENUE or EXPENSE')
    }

    const q1 = Number(body.q1 ?? 0)
    const q2 = Number(body.q2 ?? 0)
    const q3 = Number(body.q3 ?? 0)
    const q4 = Number(body.q4 ?? 0)
    const annual = body.annual != null ? Number(body.annual) : q1 + q2 + q3 + q4
    const actualQ1 = Number(body.actualQ1 ?? 0)
    const actualQ2 = Number(body.actualQ2 ?? 0)
    const actualQ3 = Number(body.actualQ3 ?? 0)
    const actualQ4 = Number(body.actualQ4 ?? 0)
    const actualAnnual = body.actualAnnual != null
      ? Number(body.actualAnnual)
      : actualQ1 + actualQ2 + actualQ3 + actualQ4

    const id = newId()
    const now = nowISO()
    const accountCode = String(body.accountCode ?? '')
    const accountName = String(body.accountName ?? '')

    await exec(
      `INSERT INTO BudgetLine (id, planId, storeId, accountCode, accountName, category, q1, q2, q3, q4, annual, actualQ1, actualQ2, actualQ3, actualQ4, actualAnnual, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, planId, storeId, accountCode, accountName, body.category, q1, q2, q3, q4, annual, actualQ1, actualQ2, actualQ3, actualQ4, actualAnnual, now, now]
    )

    // update plan totals
    const allLines = await query<BudgetLine>(
      `SELECT category, annual FROM BudgetLine WHERE planId = ?`,
      [planId]
    )
    const totalRevenueBudget = (allLines as any[])
      .filter((l: any) => l.category === 'REVENUE')
      .reduce((s: number, l: any) => s + l.annual, 0)
    const totalExpenseBudget = (allLines as any[])
      .filter((l: any) => l.category === 'EXPENSE')
      .reduce((s: number, l: any) => s + l.annual, 0)
    await exec(
      `UPDATE BudgetPlan SET totalRevenueBudget = ?, totalExpenseBudget = ?, updatedAt = ? WHERE id = ?`,
      [totalRevenueBudget, totalExpenseBudget, now, planId]
    )

    return ok({ id, planId, storeId, accountCode, accountName, category: body.category, q1, q2, q3, q4, annual, actualQ1, actualQ2, actualQ3, actualQ4, actualAnnual, createdAt: now, updatedAt: now }, 201)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    return err(msg, 500)
  }
}
