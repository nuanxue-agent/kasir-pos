import { NextRequest, NextResponse } from 'next/server'
import { query, exec } from '@/lib/db'
import { currentPeriod } from '@/lib/commissions'

async function ensureTable() {
  await exec(`CREATE TABLE IF NOT EXISTS CommissionEntry (
    id TEXT PRIMARY KEY,
    ruleId TEXT NOT NULL,
    storeId TEXT NOT NULL,
    employeeId TEXT NOT NULL,
    orderId TEXT NOT NULL,
    saleAmount REAL NOT NULL,
    commissionAmount REAL NOT NULL,
    period TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    paidAt TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`)
}

export async function GET(req: NextRequest) {
  try {
    await ensureTable()
    const { searchParams } = new URL(req.url)
    const storeId = searchParams.get('storeId')
    if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 })

    const period = searchParams.get('period') ?? currentPeriod()
    const employeeId = searchParams.get('employeeId')

    let sql = `SELECT
        ce.employeeId,
        e.name as employeeName,
        ce.period,
        SUM(ce.saleAmount) as totalSales,
        SUM(ce.commissionAmount) as totalCommission,
        COUNT(CASE WHEN ce.status = 'PENDING' THEN 1 END) as pendingCount,
        COUNT(CASE WHEN ce.status = 'APPROVED' THEN 1 END) as approvedCount,
        COUNT(CASE WHEN ce.status = 'PAID' THEN 1 END) as paidCount,
        COUNT(*) as entryCount
      FROM CommissionEntry ce
      LEFT JOIN Employee e ON e.id = ce.employeeId
      WHERE ce.storeId = ? AND ce.period = ?`
    const params: any[] = [storeId, period]

    if (employeeId) { sql += ' AND ce.employeeId = ?'; params.push(employeeId) }

    sql += ' GROUP BY ce.employeeId, ce.period ORDER BY totalCommission DESC'

    const rows = await query(sql, params)
    return NextResponse.json({ data: rows, period })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
