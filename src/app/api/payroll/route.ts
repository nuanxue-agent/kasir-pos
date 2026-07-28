import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function ensurePayrollTables() {
  await exec(`CREATE TABLE IF NOT EXISTS PayrollPeriod (
    id             TEXT PRIMARY KEY,
    storeId        TEXT NOT NULL,
    period         TEXT NOT NULL,
    status         TEXT NOT NULL DEFAULT 'DRAFT',
    totalGross     REAL NOT NULL DEFAULT 0,
    totalDeductions REAL NOT NULL DEFAULT 0,
    totalNet       REAL NOT NULL DEFAULT 0,
    processedAt    TEXT,
    disbursedAt    TEXT,
    createdAt      TEXT NOT NULL,
    updatedAt      TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS PayrollEntry (
    id           TEXT PRIMARY KEY,
    periodId     TEXT NOT NULL,
    storeId      TEXT NOT NULL,
    employeeId   TEXT NOT NULL,
    basicSalary  REAL NOT NULL DEFAULT 0,
    allowances   TEXT NOT NULL DEFAULT '{}',
    deductions   TEXT NOT NULL DEFAULT '{}',
    grossSalary  REAL NOT NULL DEFAULT 0,
    netSalary    REAL NOT NULL DEFAULT 0,
    status       TEXT NOT NULL DEFAULT 'PENDING',
    createdAt    TEXT NOT NULL,
    updatedAt    TEXT NOT NULL
  )`)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensurePayrollTables()

  const rows = await query(
    `SELECT * FROM PayrollPeriod WHERE storeId = ? ORDER BY period DESC`,
    [storeId],
  ) as any[]

  return NextResponse.json({ data: rows })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensurePayrollTables()

  const b = (await req.json()) as any
  if (!b.period || !/^\d{4}-\d{2}$/.test(b.period)) {
    return err("'period' must be in YYYY-MM format", 400, 'INVALID_FIELD')
  }

  // Prevent duplicate period per store
  const existing = await query(
    `SELECT id FROM PayrollPeriod WHERE storeId = ? AND period = ?`,
    [storeId, b.period],
  ) as any[]
  if (existing.length) return err('Payroll period already exists for this month', 409, 'DUPLICATE')

  const id = newId()
  const now = nowISO()
  await exec(
    `INSERT INTO PayrollPeriod (id, storeId, period, status, totalGross, totalDeductions, totalNet, processedAt, disbursedAt, createdAt, updatedAt)
     VALUES (?, ?, ?, 'DRAFT', 0, 0, 0, NULL, NULL, ?, ?)`,
    [id, storeId, b.period, now, now],
  )

  const [created] = await query(`SELECT * FROM PayrollPeriod WHERE id = ?`, [id]) as any[]
  return NextResponse.json({ data: created }, { status: 201 })
}
