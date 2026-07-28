import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const storeId = searchParams.get('storeId')
    const month = searchParams.get('month') // 'YYYY-MM'
    if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 })
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: 'month required in YYYY-MM format' }, { status: 400 })
    }

    // Monthly per-employee summary: count, total, paid amount, by category breakdown
    const rows = await query(
      `SELECT
         ec.employeeId,
         e.name as employeeName,
         ec.category,
         ec.status,
         COUNT(*) as claimCount,
         SUM(ec.amount) as totalAmount
       FROM ExpenseClaim ec
       LEFT JOIN Employee e ON e.id = ec.employeeId
       WHERE ec.storeId = ?
         AND ec.status IN ('SUBMITTED', 'APPROVED', 'PAID')
         AND substr(COALESCE(ec.submittedAt, ec.createdAt), 1, 7) = ?
       GROUP BY ec.employeeId, e.name, ec.category, ec.status
       ORDER BY ec.employeeId, ec.category`,
      [storeId, month],
    ) as any[]

    // Pivot into per-employee summary
    const byEmployee: Record<string, {
      employeeId: string
      employeeName: string
      month: string
      totalAmount: number
      paidAmount: number
      claimCount: number
      byCategory: Record<string, number>
    }> = {}

    for (const r of rows) {
      if (!byEmployee[r.employeeId]) {
        byEmployee[r.employeeId] = {
          employeeId: r.employeeId,
          employeeName: r.employeeName ?? r.employeeId,
          month,
          totalAmount: 0,
          paidAmount: 0,
          claimCount: 0,
          byCategory: {},
        }
      }
      const emp = byEmployee[r.employeeId]
      emp.totalAmount += Number(r.totalAmount)
      emp.claimCount += Number(r.claimCount)
      if (r.status === 'PAID') emp.paidAmount += Number(r.totalAmount)
      emp.byCategory[r.category] = (emp.byCategory[r.category] ?? 0) + Number(r.totalAmount)
    }

    return NextResponse.json({ data: Object.values(byEmployee), month })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
