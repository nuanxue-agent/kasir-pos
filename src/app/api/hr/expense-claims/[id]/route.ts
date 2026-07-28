import { NextRequest, NextResponse } from 'next/server'
import { exec, queryOne, nowISO } from '@/lib/db'
import { isValidStatusTransition, canApproveOrReject, canMarkPaid, type ExpenseStatus, type UserRole } from '@/lib/expense-claims'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await req.json() as {
      action: 'submit' | 'approve' | 'reject' | 'pay' | 'update'
      approvedBy?: string
      role?: string
      notes?: string
      title?: string
      amount?: number
      category?: string
      receiptUrl?: string
    }
    const { action, approvedBy, role, notes } = body

    const claim = await queryOne(`SELECT * FROM ExpenseClaim WHERE id = ?`, [id]) as any
    if (!claim) return NextResponse.json({ error: 'Claim not found' }, { status: 404 })

    const now = nowISO()

    if (action === 'submit') {
      if (!isValidStatusTransition(claim.status as ExpenseStatus, 'SUBMITTED')) {
        return NextResponse.json({ error: `Cannot submit from status ${claim.status}` }, { status: 400 })
      }
      await exec(
        `UPDATE ExpenseClaim SET status = 'SUBMITTED', submittedAt = ?, updatedAt = ? WHERE id = ?`,
        [now, now, id],
      )
      return NextResponse.json({ ok: true, status: 'SUBMITTED' })
    }

    if (action === 'approve') {
      if (!role || !canApproveOrReject(role as UserRole)) {
        return NextResponse.json({ error: 'Only OWNER or MANAGER can approve claims' }, { status: 403 })
      }
      if (!isValidStatusTransition(claim.status as ExpenseStatus, 'APPROVED')) {
        return NextResponse.json({ error: `Cannot approve from status ${claim.status}` }, { status: 400 })
      }
      await exec(
        `UPDATE ExpenseClaim SET status = 'APPROVED', approvedBy = ?, notes = COALESCE(?, notes), updatedAt = ? WHERE id = ?`,
        [approvedBy ?? null, notes ?? null, now, id],
      )
      return NextResponse.json({ ok: true, status: 'APPROVED' })
    }

    if (action === 'reject') {
      if (!role || !canApproveOrReject(role as UserRole)) {
        return NextResponse.json({ error: 'Only OWNER or MANAGER can reject claims' }, { status: 403 })
      }
      if (!isValidStatusTransition(claim.status as ExpenseStatus, 'REJECTED')) {
        return NextResponse.json({ error: `Cannot reject from status ${claim.status}` }, { status: 400 })
      }
      await exec(
        `UPDATE ExpenseClaim SET status = 'REJECTED', notes = COALESCE(?, notes), updatedAt = ? WHERE id = ?`,
        [notes ?? null, now, id],
      )
      return NextResponse.json({ ok: true, status: 'REJECTED' })
    }

    if (action === 'pay') {
      if (!role || !canMarkPaid(role as UserRole)) {
        return NextResponse.json({ error: 'Only OWNER or MANAGER can mark claims as paid' }, { status: 403 })
      }
      if (!isValidStatusTransition(claim.status as ExpenseStatus, 'PAID')) {
        return NextResponse.json({ error: `Cannot mark as paid from status ${claim.status}` }, { status: 400 })
      }
      await exec(
        `UPDATE ExpenseClaim SET status = 'PAID', paidAt = ?, updatedAt = ? WHERE id = ?`,
        [now, now, id],
      )
      return NextResponse.json({ ok: true, status: 'PAID' })
    }

    if (action === 'update') {
      // Allow editing only DRAFT claims
      if (claim.status !== 'DRAFT') {
        return NextResponse.json({ error: 'Only DRAFT claims can be edited' }, { status: 400 })
      }
      const sets: string[] = []
      const vals: any[] = []
      if (body.title !== undefined) { sets.push('title = ?'); vals.push(body.title) }
      if (body.amount !== undefined) { sets.push('amount = ?'); vals.push(body.amount) }
      if (body.category !== undefined) { sets.push('category = ?'); vals.push(body.category) }
      if (body.receiptUrl !== undefined) { sets.push('receiptUrl = ?'); vals.push(body.receiptUrl) }
      if (body.notes !== undefined) { sets.push('notes = ?'); vals.push(body.notes) }
      if (sets.length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
      sets.push('updatedAt = ?')
      vals.push(now, id)
      await exec(`UPDATE ExpenseClaim SET ${sets.join(', ')} WHERE id = ?`, vals)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
