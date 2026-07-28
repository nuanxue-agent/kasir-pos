import { NextRequest, NextResponse } from 'next/server'
import { query, exec, newId, nowISO } from '@/lib/db'

async function ensureTable() {
  await exec(`CREATE TABLE IF NOT EXISTS Payslip (
    id TEXT PRIMARY KEY,
    storeId TEXT NOT NULL,
    employeeId TEXT NOT NULL,
    period TEXT NOT NULL,
    basicPay REAL NOT NULL DEFAULT 0,
    allowances TEXT NOT NULL DEFAULT '{}',
    deductions TEXT NOT NULL DEFAULT '{}',
    netPay REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    issuedAt TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`)
}

function calcNetPay(
  basicPay: number,
  allowances: Record<string, number>,
  deductions: Record<string, number>,
): number {
  const totalAllowances = Object.values(allowances).reduce((s, v) => s + v, 0)
  const totalDeductions = Object.values(deductions).reduce((s, v) => s + v, 0)
  return basicPay + totalAllowances - totalDeductions
}

export async function GET(req: NextRequest) {
  try {
    await ensureTable()
    const { searchParams } = new URL(req.url)
    const storeId = searchParams.get('storeId')
    const period = searchParams.get('period')
    const employeeId = searchParams.get('employeeId')
    if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 })

    let sql = `SELECT p.*, e.name as employeeName, e.position
               FROM Payslip p
               LEFT JOIN Employee e ON e.id = p.employeeId
               WHERE p.storeId = ?`
    const params: any[] = [storeId]
    if (period) { sql += ` AND p.period = ?`; params.push(period) }
    if (employeeId) { sql += ` AND p.employeeId = ?`; params.push(employeeId) }
    sql += ` ORDER BY p.period DESC, e.name ASC`

    const rows = await query(sql, params)
    return NextResponse.json(rows)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureTable()
    const body = await req.json() as {
      storeId?: string
      employeeId?: string
      period?: string
      basicPay?: number
      allowances?: Record<string, number>
      deductions?: Record<string, number>
    }
    const {
      storeId,
      employeeId,
      period,
      basicPay = 0,
      allowances = {},
      deductions = {},
    } = body

    if (!storeId || !employeeId || !period) {
      return NextResponse.json({ error: 'storeId, employeeId, period required' }, { status: 400 })
    }
    if (basicPay < 0) {
      return NextResponse.json({ error: 'basicPay must be non-negative' }, { status: 400 })
    }

    const netPay = calcNetPay(basicPay, allowances, deductions)
    const id = newId()
    const now = nowISO()
    await exec(
      `INSERT INTO Payslip (id, storeId, employeeId, period, basicPay, allowances, deductions, netPay, status, issuedAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', NULL, ?, ?)`,
      [id, storeId, employeeId, period, basicPay, JSON.stringify(allowances), JSON.stringify(deductions), netPay, now, now],
    )
    return NextResponse.json({ id, netPay }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
