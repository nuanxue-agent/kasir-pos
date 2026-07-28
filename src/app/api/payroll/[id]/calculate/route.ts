import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import { ensurePayrollTables } from '../../route'
import { calcGrossSalary, calcPPh21Monthly, calcBPJS, calcNetSalary, type Allowances } from '@/lib/payroll'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

/**
 * POST /api/payroll/[id]/calculate
 * Auto-calculate payroll entries for all employees in the store.
 * Uses Employee.baseSalary and fetches active loan deductions.
 * Skips employees that already have an entry for this period.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const { id: periodId } = await params
  const b = await req.json().catch(() => ({})) as any
  const storeId = b.storeId ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensurePayrollTables()

  const [period] = await query(
    `SELECT * FROM PayrollPeriod WHERE id = ? AND storeId = ?`,
    [periodId, storeId],
  ) as any[]
  if (!period) return err('Payroll period not found', 404, 'NOT_FOUND')
  if (period.status === 'DISBURSED') return err('Cannot recalculate a disbursed period', 400, 'LOCKED')

  // Fetch all active employees
  const employees = await query(
    `SELECT id, name, baseSalary FROM Employee WHERE storeId = ? AND status != 'INACTIVE'`,
    [storeId],
  ).catch(() =>
    query(`SELECT id, name, baseSalary FROM Employee WHERE storeId = ?`, [storeId]),
  ) as any[]

  if (!employees.length) return err('No employees found for this store', 404, 'NO_EMPLOYEES')

  // Get existing entries for this period (skip those)
  const existingEntries = await query(
    `SELECT employeeId FROM PayrollEntry WHERE periodId = ? AND storeId = ?`,
    [periodId, storeId],
  ) as any[]
  const existingIds = new Set(existingEntries.map((e: any) => e.employeeId))

  // Get active loan deductions
  const activeLoans = await query(
    `SELECT employeeId, SUM(installmentAmount) as totalDeduction
     FROM EmployeeLoan
     WHERE storeId = ? AND status = 'ACTIVE'
     GROUP BY employeeId`,
    [storeId],
  ).catch(() => []) as any[]
  const loanMap: Record<string, number> = {}
  for (const l of activeLoans) {
    loanMap[l.employeeId] = Number(l.totalDeduction ?? 0)
  }

  const now = nowISO()
  const created: any[] = []

  for (const emp of employees) {
    if (existingIds.has(emp.id)) continue

    const basicSalary = Number(emp.baseSalary ?? 0)
    const allowances: Allowances = {}
    const loanDeduction = loanMap[emp.id] ?? 0

    const grossSalary = calcGrossSalary(basicSalary, allowances)
    const pph21 = calcPPh21Monthly(grossSalary)
    const bpjs = calcBPJS(grossSalary).total
    const deductions = { pph21, bpjs, loan: loanDeduction, other: 0 }
    const netSalary = calcNetSalary(grossSalary, deductions)

    const id = newId()
    await exec(
      `INSERT INTO PayrollEntry (id, periodId, storeId, employeeId, basicSalary, allowances, deductions, grossSalary, netSalary, status, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)`,
      [id, periodId, storeId, emp.id, basicSalary, JSON.stringify(allowances), JSON.stringify(deductions), grossSalary, netSalary, now, now],
    )
    created.push({ id, employeeId: emp.id, employeeName: emp.name, basicSalary, grossSalary, netSalary, deductions })
  }

  // Recompute period totals
  const allEntries = await query(
    `SELECT grossSalary, netSalary, deductions FROM PayrollEntry WHERE periodId = ? AND storeId = ?`,
    [periodId, storeId],
  ) as any[]

  let totalGross = 0, totalNet = 0, totalDeductions = 0
  for (const e of allEntries) {
    totalGross += Number(e.grossSalary ?? 0)
    totalNet += Number(e.netSalary ?? 0)
    const d = typeof e.deductions === 'string' ? JSON.parse(e.deductions) : (e.deductions ?? {})
    totalDeductions += (Number(d.pph21 ?? 0) + Number(d.bpjs ?? 0) + Number(d.loan ?? 0) + Number(d.other ?? 0))
  }

  await exec(
    `UPDATE PayrollPeriod SET totalGross = ?, totalDeductions = ?, totalNet = ?, updatedAt = ? WHERE id = ?`,
    [totalGross, totalDeductions, totalNet, now, periodId],
  )

  return NextResponse.json({
    data: {
      periodId,
      created: created.length,
      skipped: existingIds.size,
      totalGross,
      totalDeductions,
      totalNet,
      entries: created,
    },
  })
}
