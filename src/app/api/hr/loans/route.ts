import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import { calcInstallmentAmount } from '@/lib/loans'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function ensureLoanTables() {
  await exec(`CREATE TABLE IF NOT EXISTS EmployeeLoan (
    id               TEXT PRIMARY KEY,
    storeId          TEXT NOT NULL,
    employeeId       TEXT NOT NULL,
    type             TEXT NOT NULL DEFAULT 'LOAN',
    amount           REAL NOT NULL DEFAULT 0,
    interestRate     REAL NOT NULL DEFAULT 0,
    installments     INTEGER NOT NULL DEFAULT 1,
    installmentAmount REAL NOT NULL DEFAULT 0,
    status           TEXT NOT NULL DEFAULT 'PENDING',
    approvedBy       TEXT,
    approvedAt       TEXT,
    startDate        TEXT,
    createdAt        TEXT NOT NULL,
    updatedAt        TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS LoanRepayment (
    id       TEXT PRIMARY KEY,
    loanId   TEXT NOT NULL,
    storeId  TEXT NOT NULL,
    amount   REAL NOT NULL DEFAULT 0,
    dueDate  TEXT NOT NULL,
    paidAt   TEXT,
    status   TEXT NOT NULL DEFAULT 'PENDING',
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`)
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const sp = req.nextUrl.searchParams
    const storeId = sp.get('storeId') ?? user.stores?.[0]?.id
    if (!storeId) return err('storeId required')

    await ensureLoanTables()

    const status = sp.get('status')
    const employeeId = sp.get('employeeId')
    const type = sp.get('type')

    let sql = `SELECT l.*, e.name as employeeName
      FROM EmployeeLoan l
      LEFT JOIN Employee e ON e.id = l.employeeId
      WHERE l.storeId = ?`
    const params: any[] = [storeId]

    if (status) { sql += ' AND l.status = ?'; params.push(status) }
    if (employeeId) { sql += ' AND l.employeeId = ?'; params.push(employeeId) }
    if (type) { sql += ' AND l.type = ?'; params.push(type) }

    sql += ' ORDER BY l.createdAt DESC'

    const rows = await query(sql, params)
    return NextResponse.json({ data: rows })
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const sp = req.nextUrl.searchParams
    const storeId = sp.get('storeId') ?? user.stores?.[0]?.id
    if (!storeId) return err('storeId required')

    await ensureLoanTables()

    const b = (await req.json()) as any
    if (!b.employeeId) return err('employeeId required')
    if (!b.amount || Number(b.amount) <= 0) return err('amount must be positive')
    if (!b.installments || Number(b.installments) < 1) return err('installments must be >= 1')

    const type = b.type === 'ADVANCE' ? 'ADVANCE' : 'LOAN'
    const amount = Number(b.amount)
    const interestRate = type === 'ADVANCE' ? 0 : Number(b.interestRate ?? 0)
    const installments = Number(b.installments)
    const installmentAmount = calcInstallmentAmount(amount, interestRate, installments)

    const t = nowISO()
    const id = newId()
    await exec(
      `INSERT INTO EmployeeLoan
        (id, storeId, employeeId, type, amount, interestRate, installments, installmentAmount, status, startDate, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)`,
      [id, storeId, b.employeeId, type, amount, interestRate, installments, installmentAmount, b.startDate ?? null, t, t],
    )

    return NextResponse.json({ id, installmentAmount }, { status: 201 })
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500)
  }
}
