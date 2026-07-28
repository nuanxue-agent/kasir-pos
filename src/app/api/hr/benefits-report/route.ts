import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
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

    // month param: YYYY-MM, defaults to current month
    const month = searchParams.get('month') ?? new Date().toISOString().slice(0, 7)

    // Fetch all active enrollments with plan info and employee salary
    const rows = await query(
      `SELECT eb.id, eb.employeeId, eb.value, eb.planId,
              e.name as employeeName, e.baseSalary,
              bp.name as planName, bp.type as planType,
              bp.calculationBase, bp.employeeContribution, bp.employerContribution
       FROM EmployeeBenefit eb
       LEFT JOIN Employee e ON e.id = eb.employeeId
       LEFT JOIN BenefitPlan bp ON bp.id = eb.planId
       WHERE eb.storeId = ? AND eb.active = 1`,
      [storeId]
    )

    type BenefitRow = {
      id: string
      employeeId: string
      employeeName: string
      baseSalary: number
      value: number
      planId: string
      planName: string
      planType: string
      calculationBase: string
      employeeContribution: number
      employerContribution: number
    }

    const items = rows as BenefitRow[]

    // Calculate actual contribution amounts
    const detail = items.map(r => {
      const base = r.calculationBase === 'PERCENTAGE_SALARY'
        ? (r.baseSalary ?? 0)
        : 1
      const empContrib = r.calculationBase === 'PERCENTAGE_SALARY'
        ? Math.round(base * (r.employeeContribution / 100))
        : r.employeeContribution
      const erContrib = r.calculationBase === 'PERCENTAGE_SALARY'
        ? Math.round(base * (r.employerContribution / 100))
        : r.employerContribution

      return {
        benefitId: r.id,
        employeeId: r.employeeId,
        employeeName: r.employeeName,
        planId: r.planId,
        planName: r.planName,
        planType: r.planType,
        calculationBase: r.calculationBase,
        employeeContribution: empContrib,
        employerContribution: erContrib,
        totalContribution: empContrib + erContrib,
      }
    })

    // Aggregate by plan type
    const byType: Record<string, { employeeTotal: number; employerTotal: number; count: number }> = {}
    for (const d of detail) {
      if (!byType[d.planType]) byType[d.planType] = { employeeTotal: 0, employerTotal: 0, count: 0 }
      byType[d.planType].employeeTotal += d.employeeContribution
      byType[d.planType].employerTotal += d.employerContribution
      byType[d.planType].count += 1
    }

    const summary = Object.entries(byType).map(([type, v]) => ({
      type,
      employeeTotal: v.employeeTotal,
      employerTotal: v.employerTotal,
      total: v.employeeTotal + v.employerTotal,
      enrolledCount: v.count,
    }))

    const grandEmployeeTotal = detail.reduce((s, d) => s + d.employeeContribution, 0)
    const grandEmployerTotal = detail.reduce((s, d) => s + d.employerContribution, 0)

    return NextResponse.json({
      month,
      storeId,
      summary,
      detail,
      totals: {
        employeeTotal: grandEmployeeTotal,
        employerTotal: grandEmployerTotal,
        grandTotal: grandEmployeeTotal + grandEmployerTotal,
        enrolledCount: detail.length,
      },
    })
  } catch (e: any) {
    return err(e.message, 500)
  }
}
