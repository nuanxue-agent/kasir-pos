import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import { ensurePayrollTables } from '../../route'
import { calcGrossSalary, calcPPh21Monthly, calcBPJS, calcNetSalary, type Allowances } from '@/lib/payroll'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const { id: periodId } = await params
  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensurePayrollTables()

  const rows = await query(
    `SELECT e.*, emp.name AS employeeName, emp.position AS employeePosition
     FROM PayrollEntry e
     LEFT JOIN Employee emp ON emp.id = e.employeeId
     WHERE e.periodId = ? AND e.storeId = ?
     ORDER BY emp.name ASC`,
    [periodId, storeId],
  ).catch(() =>
    query(
      `SELECT * FROM PayrollEntry WHERE periodId = ? AND storeId = ?`,
      [periodId, storeId],
    ),
  ) as any[]

  return NextResponse.json({ data: rows })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const { id: periodId } = await params
  const b = (await req.json()) as any
  const storeId = b.storeId ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensurePayrollTables()

  // Verify period exists and belongs to store
  const [period] = await query(
    `SELECT * FROM PayrollPeriod WHERE id = ? AND storeId = ?`,
    [periodId, storeId],
  ) as any[]
  if (!period) return err('Payroll period not found', 404, 'NOT_FOUND')
  if (period.status === 'DISBURSED') return err('Cannot modify a disbursed period', 400, 'LOCKED')

  if (!b.employeeId) return err("'employeeId' is required", 400, 'MISSING_FIELD')

  const basicSalary = Number(b.basicSalary ?? 0)
  const allowances: Allowances = b.allowances ?? {}
  const loanDeduction = Number(b.loanDeduction ?? 0)
  const otherDeduction = Number(b.otherDeduction ?? 0)

  const grossSalary = calcGrossSalary(basicSalary, allowances)
  const pph21 = calcPPh21Monthly(grossSalary)
  const bpjs = calcBPJS(grossSalary).total
  const deductions = { pph21, bpjs, loan: loanDeduction, other: otherDeduction }
  const netSalary = calcNetSalary(grossSalary, deductions)

  // Check for duplicate entry
  const existing = await query(
    `SELECT id FROM PayrollEntry WHERE periodId = ? AND employeeId = ? AND storeId = ?`,
    [periodId, b.employeeId, storeId],
  ) as any[]
  if (existing.length) return err('Entry already exists for this employee in this period', 409, 'DUPLICATE')

  const id = newId()
  const now = nowISO()
  await exec(
    `INSERT INTO PayrollEntry (id, periodId, storeId, employeeId, basicSalary, allowances, deductions, grossSalary, netSalary, status, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)`,
    [id, periodId, storeId, b.employeeId, basicSalary, JSON.stringify(allowances), JSON.stringify(deductions), grossSalary, netSalary, now, now],
  )

  // Update period totals
  await exec(
    `UPDATE PayrollPeriod SET
       totalGross = (SELECT COALESCE(SUM(grossSalary),0) FROM PayrollEntry WHERE periodId = ?),
       totalDeductions = (SELECT COALESCE(SUM(json_extract(deductions,'$.pph21') + json_extract(deductions,'$.bpjs') + json_extract(deductions,'$.loan') + json_extract(deductions,'$.other')),0) FROM PayrollEntry WHERE periodId = ?),
       totalNet = (SELECT COALESCE(SUM(netSalary),0) FROM PayrollEntry WHERE periodId = ?),
       updatedAt = ?
     WHERE id = ?`,
    [periodId, periodId, periodId, now, periodId],
  ).catch(() =>
    exec(
      `UPDATE PayrollPeriod SET totalGross = totalGross + ?, totalNet = totalNet + ?, updatedAt = ? WHERE id = ?`,
      [grossSalary, netSalary, now, periodId],
    ),
  )

  const [created] = await query(`SELECT * FROM PayrollEntry WHERE id = ?`, [id]) as any[]
  return NextResponse.json({ data: created }, { status: 201 })
}
