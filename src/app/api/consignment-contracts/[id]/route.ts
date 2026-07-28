import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { exec, queryOne, nowISO } from '@/lib/db'
import { ensureConsignmentTables } from '../route'
import { isValidTransition } from '@/lib/consignment'
import type { ContractStatus } from '@/lib/consignment'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')

  await ensureConsignmentTables()

  const existing = (await queryOne(
    `SELECT * FROM ConsignmentContract WHERE id = ?`,
    [id],
  )) as any
  if (!existing) return err('Contract not found', 404, 'NOT_FOUND')

  const b = (await req.json()) as any

  const validStatuses: ContractStatus[] = ['ACTIVE', 'TERMINATED']
  if (b.status !== undefined) {
    if (!validStatuses.includes(b.status)) {
      return err('Invalid status', 400, 'INVALID_FIELD')
    }
    if (!isValidTransition(existing.status as ContractStatus, b.status as ContractStatus)) {
      return err(
        `Cannot transition from ${existing.status} to ${b.status}`,
        409,
        'INVALID_TRANSITION',
      )
    }
  }

  if (b.commissionRate !== undefined) {
    const rate = Number(b.commissionRate)
    if (isNaN(rate) || rate < 0 || rate > 100) {
      return err('commissionRate must be 0–100', 400, 'INVALID_FIELD')
    }
  }

  const validPeriods = ['WEEKLY', 'MONTHLY']
  if (b.settlementPeriod !== undefined && !validPeriods.includes(b.settlementPeriod)) {
    return err('settlementPeriod must be WEEKLY or MONTHLY', 400, 'INVALID_FIELD')
  }

  const sets: string[] = []
  const vals: any[] = []

  if (b.vendorId !== undefined)         { sets.push('vendorId = ?');         vals.push(b.vendorId) }
  if (b.commissionRate !== undefined)   { sets.push('commissionRate = ?');   vals.push(Number(b.commissionRate)) }
  if (b.settlementPeriod !== undefined) { sets.push('settlementPeriod = ?'); vals.push(b.settlementPeriod) }
  if (b.status !== undefined)           { sets.push('status = ?');           vals.push(b.status) }
  if (b.startDate !== undefined)        { sets.push('startDate = ?');        vals.push(b.startDate) }

  if (sets.length === 0) return err('No fields to update', 400, 'MISSING_FIELD')

  sets.push('updatedAt = ?')
  vals.push(nowISO())
  vals.push(id)

  await exec(`UPDATE ConsignmentContract SET ${sets.join(', ')} WHERE id = ?`, vals)
  return NextResponse.json({ ok: true })
}
