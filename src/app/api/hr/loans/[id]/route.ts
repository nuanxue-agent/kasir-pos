import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import { ensureLoanTables } from '../route'
import { generateRepaymentSchedule } from '@/lib/loans'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const { id } = await params
    await ensureLoanTables()

    const loan = (await query(`SELECT * FROM EmployeeLoan WHERE id = ?`, [id]) as any[])[0]
    if (!loan) return err('Loan not found', 404)

    const b = (await req.json()) as any
    const action = b.action // 'approve' | 'reject' | 'activate' | 'close'

    if (!action) return err('action required')

    const t = nowISO()

    if (action === 'approve') {
      if (loan.status !== 'PENDING') return err('Only PENDING loans can be approved')
      const approvedBy = (user as any).name ?? (user as any).email ?? 'system'
      await exec(
        `UPDATE EmployeeLoan SET status = 'APPROVED', approvedBy = ?, approvedAt = ?, updatedAt = ? WHERE id = ?`,
        [approvedBy, t, t, id],
      )
      return NextResponse.json({ ok: true, status: 'APPROVED' })
    }

    if (action === 'reject') {
      if (loan.status !== 'PENDING') return err('Only PENDING loans can be rejected')
      await exec(
        `UPDATE EmployeeLoan SET status = 'REJECTED', updatedAt = ? WHERE id = ?`,
        [t, id],
      )
      return NextResponse.json({ ok: true, status: 'REJECTED' })
    }

    if (action === 'activate') {
      if (loan.status !== 'APPROVED') return err('Only APPROVED loans can be activated')

      const startDate = b.startDate ?? loan.startDate
      if (!startDate) return err('startDate required to activate')

      await exec(
        `UPDATE EmployeeLoan SET status = 'ACTIVE', startDate = ?, updatedAt = ? WHERE id = ?`,
        [startDate, t, id],
      )

      // Generate repayment schedule
      const schedule = generateRepaymentSchedule(
        id,
        loan.storeId,
        Number(loan.amount),
        Number(loan.interestRate),
        Number(loan.installments),
        startDate,
      )
      for (const rep of schedule) {
        await exec(
          `INSERT INTO LoanRepayment (id, loanId, storeId, amount, dueDate, status, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?)`,
          [newId(), rep.loanId, rep.storeId, rep.amount, rep.dueDate, t, t],
        )
      }

      return NextResponse.json({ ok: true, status: 'ACTIVE', repayments: schedule.length })
    }

    if (action === 'close') {
      if (loan.status !== 'ACTIVE') return err('Only ACTIVE loans can be closed')
      await exec(
        `UPDATE EmployeeLoan SET status = 'PAID', updatedAt = ? WHERE id = ?`,
        [t, id],
      )
      return NextResponse.json({ ok: true, status: 'PAID' })
    }

    return err(`Unknown action: ${action}`)
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Internal error' }, { status: 500 })
  }
}
