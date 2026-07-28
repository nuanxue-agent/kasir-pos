// PATCH /api/petty-cash-funds/[id]/transactions/[txId]
// Handles approve / settle / reject for cash advances
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, nowISO } from '@/lib/db'
import { ensurePettyCashFundTables } from '../../../route'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

type AdvanceStatus = 'PENDING' | 'APPROVED' | 'SETTLED' | 'REJECTED'

const VALID_TRANSITIONS: Record<AdvanceStatus, AdvanceStatus[]> = {
  PENDING:  ['APPROVED', 'REJECTED'],
  APPROVED: ['SETTLED', 'REJECTED'],
  SETTLED:  [],
  REJECTED: [],
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; txId: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const { id: fundId, txId } = await params
    const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
    if (!storeId) return err('storeId required')

    const hasAccess = (user.stores as any[])?.some((s: { id: string }) => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    await ensurePettyCashFundTables()

    const b = (await req.json()) as any
    const newStatus: AdvanceStatus = b.status
    if (!newStatus) return err("Field 'status' is required")

    // Load the transaction
    const txRows = await query(
      `SELECT * FROM PettyCashTransaction2 WHERE id = ? AND fundId = ?`,
      [txId, fundId],
    )
    if (!(txRows as any[]).length) return err('Transaction not found', 404)
    const tx = (txRows as any[])[0]

    const currentStatus = tx.status as AdvanceStatus
    const allowed = VALID_TRANSITIONS[currentStatus] ?? []
    if (!allowed.includes(newStatus)) {
      return err(`Cannot transition from ${currentStatus} to ${newStatus}`, 422)
    }

    const t = nowISO()
    const approvedBy = b.approvedBy ?? (user as any).name ?? ''

    // Load current fund balance
    const fundRows = await query(
      `SELECT balance FROM PettyCashFund2 WHERE id = ? AND storeId = ?`,
      [fundId, storeId],
    )
    if (!(fundRows as any[]).length) return err('Fund not found', 404)
    const currentBalance = Number((fundRows as any[])[0].balance)
    const amount = Number(tx.amount)

    let newFundBalance = currentBalance

    if (newStatus === 'APPROVED' && tx.type === 'ADVANCE') {
      // Deduct from fund when advance is approved
      newFundBalance = currentBalance - amount
      await exec(
        `UPDATE PettyCashFund2 SET balance = ?, updatedAt = ? WHERE id = ?`,
        [newFundBalance, t, fundId],
      )
    } else if (newStatus === 'REJECTED' && currentStatus === 'APPROVED' && tx.type === 'ADVANCE') {
      // Refund to fund if rejecting an already-approved advance
      newFundBalance = currentBalance + amount
      await exec(
        `UPDATE PettyCashFund2 SET balance = ?, updatedAt = ? WHERE id = ?`,
        [newFundBalance, t, fundId],
      )
    }

    // Handle settlement: update receiptNo if provided
    const receiptNo = b.receiptNo ?? tx.receiptNo

    await exec(
      `UPDATE PettyCashTransaction2 SET status = ?, approvedBy = ?, receiptNo = ? WHERE id = ?`,
      [newStatus, approvedBy, receiptNo, txId],
    )

    return ok({ ok: true, balance: newFundBalance })
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500)
  }
}
