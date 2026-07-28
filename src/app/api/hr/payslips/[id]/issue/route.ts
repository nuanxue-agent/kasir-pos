import { NextRequest, NextResponse } from 'next/server'
import { query, exec, nowISO } from '@/lib/db'

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

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await ensureTable()
    const { id } = await params
    const rows = await query(`SELECT * FROM Payslip WHERE id = ? LIMIT 1`, [id])
    if (rows.length === 0) {
      return NextResponse.json({ error: 'Payslip not found' }, { status: 404 })
    }
    const payslip = rows[0] as any
    if (payslip.status === 'ISSUED') {
      return NextResponse.json({ error: 'Payslip already issued' }, { status: 409 })
    }
    const now = nowISO()
    await exec(
      `UPDATE Payslip SET status = 'ISSUED', issuedAt = ?, updatedAt = ? WHERE id = ?`,
      [now, now, id],
    )
    return NextResponse.json({ id, status: 'ISSUED', issuedAt: now })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
