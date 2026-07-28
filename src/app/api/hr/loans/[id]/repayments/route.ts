import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import { ensureLoanTables } from '../../route'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)

    const { id } = await params
    await ensureLoanTables()

    const loan = (await query(`SELECT * FROM EmployeeLoan WHERE id = ?`, [id]) as any[])[0]
    if (!loan) return err('Loan not found', 404)

    const rows = await query(
      `SELECT * FROM LoanRepayment WHERE loanId = ? ORDER BY dueDate ASC`,
      [id],
    )
    return NextResponse.json({ data: rows })
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500)
  }
}

export async function POST(
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
    if (!b.amount || Number(b.amount) <= 0) return err('amount must be positive')
    if (!b.dueDate) return err('dueDate required')

    const t = nowISO()
    const repaymentId = newId()
    const storeId = loan.storeId

    await exec(
      `INSERT INTO LoanRepayment (id, loanId, storeId, amount, dueDate, status, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?)`,
      [repaymentId, id, storeId, Number(b.amount), b.dueDate, t, t],
    )

    return NextResponse.json({ id: repaymentId }, { status: 201 })
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500)
  }
}
