// PATCH /api/bank-accounts/[id]
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { queryOne, exec, nowISO } from '@/lib/db'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

// PATCH /api/bank-accounts/[id]?storeId=xxx
// Body: { name?, bankName?, accountNumber?, currency?, balance?, lastReconciledAt? }
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
    const account = await queryOne<{ id: string; storeId: string }>(
      `SELECT id, storeId FROM BankAccount WHERE id = ? AND storeId = ?`,
      [id, storeId]
    )
    if (!account) return err('Bank account not found', 404)

    const body = await req.json() as {
      name?: string
      bankName?: string
      accountNumber?: string
      currency?: string
      balance?: number
      lastReconciledAt?: string | null
      markReconciled?: boolean
    }

    const setClauses: string[] = []
    const setParams: unknown[] = []

    if (body.name?.trim()) { setClauses.push('name = ?'); setParams.push(body.name.trim()) }
    if (body.bankName?.trim()) { setClauses.push('bankName = ?'); setParams.push(body.bankName.trim()) }
    if (body.accountNumber?.trim()) { setClauses.push('accountNumber = ?'); setParams.push(body.accountNumber.trim()) }
    if (body.currency) { setClauses.push('currency = ?'); setParams.push(body.currency) }
    if (body.balance !== undefined) { setClauses.push('balance = ?'); setParams.push(Number(body.balance)) }
    if (body.markReconciled) { setClauses.push('lastReconciledAt = ?'); setParams.push(nowISO()) }
    else if (body.lastReconciledAt !== undefined) { setClauses.push('lastReconciledAt = ?'); setParams.push(body.lastReconciledAt) }

    if (setClauses.length === 0) return err('No fields to update')

    setParams.push(id)
    await exec(
      `UPDATE BankAccount SET ${setClauses.join(', ')} WHERE id = ?`,
      setParams
    )

    const updated = await queryOne<Record<string, unknown>>(
      `SELECT * FROM BankAccount WHERE id = ?`,
      [id]
    )
    return ok(updated)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    return err(msg, 500)
  }
}
