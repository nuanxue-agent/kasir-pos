import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, nowISO } from '@/lib/db'
import { ensurePayrollTables } from '../route'
import { isValidPeriodTransition, type PeriodStatus } from '@/lib/payroll'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const { id } = await params
  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensurePayrollTables()

  const [period] = await query(
    `SELECT * FROM PayrollPeriod WHERE id = ? AND storeId = ?`,
    [id, storeId],
  ) as any[]
  if (!period) return err('Payroll period not found', 404, 'NOT_FOUND')

  return NextResponse.json({ data: period })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const { id } = await params
  const b = (await req.json()) as any
  const storeId = b.storeId ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensurePayrollTables()

  const [period] = await query(
    `SELECT * FROM PayrollPeriod WHERE id = ? AND storeId = ?`,
    [id, storeId],
  ) as any[]
  if (!period) return err('Payroll period not found', 404, 'NOT_FOUND')

  const action: string = b.action ?? ''
  const now = nowISO()

  if (action === 'approve') {
    if (!isValidPeriodTransition(period.status as PeriodStatus, 'APPROVED')) {
      return err(`Cannot approve from status '${period.status}'`, 400, 'INVALID_TRANSITION')
    }
    await exec(
      `UPDATE PayrollPeriod SET status = 'APPROVED', processedAt = ?, updatedAt = ? WHERE id = ?`,
      [now, now, id],
    )
  } else if (action === 'disburse') {
    if (!isValidPeriodTransition(period.status as PeriodStatus, 'DISBURSED')) {
      return err(`Cannot disburse from status '${period.status}'`, 400, 'INVALID_TRANSITION')
    }
    // Mark all entries as PAID
    await exec(
      `UPDATE PayrollEntry SET status = 'PAID', updatedAt = ? WHERE periodId = ? AND storeId = ?`,
      [now, id, storeId],
    )
    await exec(
      `UPDATE PayrollPeriod SET status = 'DISBURSED', disbursedAt = ?, updatedAt = ? WHERE id = ?`,
      [now, now, id],
    )
  } else if (action === 'process') {
    if (!isValidPeriodTransition(period.status as PeriodStatus, 'PROCESSING')) {
      return err(`Cannot process from status '${period.status}'`, 400, 'INVALID_TRANSITION')
    }
    await exec(
      `UPDATE PayrollPeriod SET status = 'PROCESSING', updatedAt = ? WHERE id = ?`,
      [now, id],
    )
  } else {
    return err("'action' must be 'approve', 'disburse', or 'process'", 400, 'INVALID_ACTION')
  }

  const [updated] = await query(`SELECT * FROM PayrollPeriod WHERE id = ?`, [id]) as any[]
  return NextResponse.json({ data: updated })
}
