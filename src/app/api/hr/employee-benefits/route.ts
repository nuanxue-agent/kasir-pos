import { NextRequest, NextResponse } from 'next/server'
import { query, exec, newId, nowISO } from '@/lib/db'
import { ensureBenefitsTables } from '../benefit-plans/route'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function GET(req: NextRequest) {
  try {
    await ensureBenefitsTables()
    const { searchParams } = new URL(req.url)
    const storeId = searchParams.get('storeId')
    if (!storeId) return err('storeId required')

    const employeeId = searchParams.get('employeeId')

    let sql = `SELECT eb.*, e.name as employeeName, bp.name as planName, bp.type as planType,
                      bp.calculationBase, bp.employeeContribution, bp.employerContribution
               FROM EmployeeBenefit eb
               LEFT JOIN Employee e ON e.id = eb.employeeId
               LEFT JOIN BenefitPlan bp ON bp.id = eb.planId
               WHERE eb.storeId = ?`
    const params: any[] = [storeId]

    if (employeeId) { sql += ' AND eb.employeeId = ?'; params.push(employeeId) }
    sql += ' ORDER BY e.name ASC, bp.type ASC'

    const rows = await query(sql, params)
    const data = (rows as any[]).map(r => ({ ...r, active: Boolean(r.active) }))
    return NextResponse.json({ data })
  } catch (e: any) {
    return err(e.message, 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureBenefitsTables()
    const b = (await req.json()) as any
    if (!b.storeId) return err('storeId required')
    if (!b.employeeId) return err("Field 'employeeId' is required")
    if (!b.planId) return err("Field 'planId' is required")

    // Validate plan exists
    const plans = await query(`SELECT * FROM BenefitPlan WHERE id = ? AND storeId = ?`, [b.planId, b.storeId])
    if (!(plans as any[]).length) return err('Benefit plan not found')

    // Check duplicate active enrollment
    const existing = await query(
      `SELECT id FROM EmployeeBenefit WHERE employeeId = ? AND planId = ? AND active = 1`,
      [b.employeeId, b.planId]
    )
    if ((existing as any[]).length) return err('Employee is already enrolled in this benefit plan')

    const t = nowISO()
    const id = newId()
    await exec(
      `INSERT INTO EmployeeBenefit (id, employeeId, planId, storeId, active, enrolledAt, value, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)`,
      [id, b.employeeId, b.planId, b.storeId, b.enrolledAt ?? t, b.value ?? 0, t, t]
    )
    return NextResponse.json({ id }, { status: 201 })
  } catch (e: any) {
    return err(e.message, 500)
  }
}
