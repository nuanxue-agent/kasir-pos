import { NextRequest, NextResponse } from 'next/server'
import { query, exec, newId, nowISO } from '@/lib/db'

async function ensureTable() {
  await exec(`CREATE TABLE IF NOT EXISTS EmployeeSelfService (
    id TEXT PRIMARY KEY,
    employeeId TEXT NOT NULL UNIQUE,
    storeId TEXT NOT NULL,
    lastLogin TEXT,
    notifPrefs TEXT NOT NULL DEFAULT '{}',
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`)
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ employeeId: string }> },
) {
  try {
    await ensureTable()
    const { employeeId } = await params
    const { searchParams } = new URL(req.url)
    const storeId = searchParams.get('storeId')
    if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 })

    // Upsert self-service record and update lastLogin
    const now = nowISO()
    const existing = await query(
      `SELECT id FROM EmployeeSelfService WHERE employeeId = ? AND storeId = ?`,
      [employeeId, storeId],
    )
    if (existing.length === 0) {
      const id = newId()
      await exec(
        `INSERT INTO EmployeeSelfService (id, employeeId, storeId, lastLogin, notifPrefs, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, '{}', ?, ?)`,
        [id, employeeId, storeId, now, now, now],
      )
    } else {
      await exec(
        `UPDATE EmployeeSelfService SET lastLogin = ?, updatedAt = ? WHERE employeeId = ? AND storeId = ?`,
        [now, now, employeeId, storeId],
      )
    }

    // Fetch all related data in parallel
    const [
      employeeRows,
      payslipRows,
      shiftRows,
      leaveRows,
      leaveBalanceRows,
      performanceRows,
      trainingRows,
      ssRows,
    ] = await Promise.all([
      query(`SELECT * FROM Employee WHERE id = ? LIMIT 1`, [employeeId]),
      query(
        `SELECT * FROM Payslip WHERE employeeId = ? AND storeId = ? ORDER BY period DESC LIMIT 12`,
        [employeeId, storeId],
      ),
      query(
        `SELECT * FROM Shift WHERE employeeId = ? AND storeId = ? ORDER BY date DESC LIMIT 30`,
        [employeeId, storeId],
      ),
      query(
        `SELECT * FROM LeaveRequest WHERE employeeId = ? AND storeId = ? ORDER BY createdAt DESC LIMIT 10`,
        [employeeId, storeId],
      ),
      query(
        `SELECT annualBalance FROM Employee WHERE id = ? LIMIT 1`,
        [employeeId],
      ).catch(() => []),
      query(
        `SELECT * FROM PerformanceReview WHERE employeeId = ? AND storeId = ? ORDER BY createdAt DESC LIMIT 5`,
        [employeeId, storeId],
      ).catch(() => []),
      query(
        `SELECT * FROM Training WHERE employeeId = ? AND storeId = ? ORDER BY createdAt DESC LIMIT 10`,
        [employeeId, storeId],
      ).catch(() => []),
      query(
        `SELECT * FROM EmployeeSelfService WHERE employeeId = ? AND storeId = ? LIMIT 1`,
        [employeeId, storeId],
      ),
    ])

    const employee = employeeRows[0] ?? null
    const leaveBalance =
      (leaveBalanceRows[0] as any)?.annualBalance ??
      employee?.annualBalance ??
      12

    // Pending / recent leaves
    const pendingLeaves = leaveRows.filter(
      (l: any) => l.status === 'PENDING' || l.status === 'APPROVED',
    )

    const ss = ssRows[0] ?? {}

    return NextResponse.json({
      employee,
      payslips: payslipRows,
      shifts: shiftRows,
      leaveBalance,
      pendingLeaves,
      performanceScores: performanceRows,
      trainingStatus: trainingRows,
      lastLogin: (ss as any).lastLogin ?? null,
      notifPrefs: (() => {
        try {
          return JSON.parse((ss as any).notifPrefs ?? '{}')
        } catch {
          return {}
        }
      })(),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
