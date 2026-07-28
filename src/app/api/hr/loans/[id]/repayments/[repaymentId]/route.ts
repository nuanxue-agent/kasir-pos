import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, nowISO } from '@/lib/db'
import { ensureLoanTables } from '../../../route'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; repaymentId: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)

    const { id, repaymentId } = await params
    await ensureLoanTables()

    const repayment = (await query(
      `SELECT * FROM LoanRepayment WHERE id = ? AND loanId = ?`,
      [repaymentId, id],
    ) as any[])[0]
    if (!repayment) return err('Repayment not found', 404)

    if (repayment.status === 'PAID') return err('Repayment already paid')

    const t = nowISO()
    const b = (await req.json()) as any
    const paidAt = b.paidAt ?? t

    await exec(
      `UPDATE LoanRepayment SET status = 'PAID', paidAt = ?, updatedAt = ? WHERE id = ?`,
      [paidAt, t, repaymentId],
    )

    // Check if all repayments for the loan are now paid → auto-close loan
    const pending = await query(
      `SELECT id FROM LoanRepayment WHERE loanId = ? AND status != 'PAID'`,
      [id],
    )
    if ((pending as any[]).length === 0) {
      await exec(
        `UPDATE EmployeeLoan SET status = 'PAID', updatedAt = ? WHERE id = ? AND status = 'ACTIVE'`,
        [t, id],
      )
    }

    return NextResponse.json({ ok: true, paidAt, loanFullyPaid: (pending as any[]).length === 0 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Internal error' }, { status: 500 })
  }
}
