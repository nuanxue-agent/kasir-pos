import { NextRequest, NextResponse } from 'next/server'
import { query, exec, newId, nowISO } from '@/lib/db'
import { dateToPeriod } from '@/lib/commissions'
import type { CommissionStatus } from '@/lib/commissions'

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

    const employeeId = searchParams.get('employeeId')
    const period = searchParams.get('period')
    const status = searchParams.get('status') as CommissionStatus | null

    let sql = `SELECT ce.*, e.name as employeeName
      FROM CommissionEntry ce
      LEFT JOIN Employee e ON e.id = ce.employeeId
      WHERE ce.storeId = ?`
    const params: any[] = [storeId]

    if (employeeId) { sql += ' AND ce.employeeId = ?'; params.push(employeeId) }
    if (period) { sql += ' AND ce.period = ?'; params.push(period) }
    if (status) { sql += ' AND ce.status = ?'; params.push(status) }

    sql += ' ORDER BY ce.createdAt DESC'

    const rows = await query(sql, params)
    return NextResponse.json({ data: rows })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureTable()
    const body = await req.json() as any
    const {
      ruleId,
      storeId,
      employeeId,
      orderId,
      saleAmount,
      commissionAmount,
      period,
    } = body

    if (!ruleId || !storeId || !employeeId || !orderId || saleAmount == null || commissionAmount == null) {
      return NextResponse.json(
        { error: 'ruleId, storeId, employeeId, orderId, saleAmount, commissionAmount required' },
        { status: 400 },
      )
    }
    if (saleAmount < 0 || commissionAmount < 0) {
      return NextResponse.json({ error: 'amounts must be >= 0' }, { status: 400 })
    }

    const resolvedPeriod = period ?? dateToPeriod(new Date())
    const id = newId()
    const now = nowISO()

    await exec(
      `INSERT INTO CommissionEntry (id, ruleId, storeId, employeeId, orderId, saleAmount, commissionAmount, period, status, paidAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', NULL, ?, ?)`,
      [id, ruleId, storeId, employeeId, orderId, saleAmount, commissionAmount, resolvedPeriod, now, now],
    )
    return NextResponse.json({ id }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
