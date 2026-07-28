import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { exec, queryOne, nowISO } from '@/lib/db'
import { ensureFranchiseTables } from '../route'
import { isValidFranchiseTransition } from '@/lib/franchise'

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

  await ensureFranchiseTables()

  const row = await queryOne(`SELECT * FROM Franchise WHERE id = ?`, [id]) as any
  if (!row) return err('Franchise not found', 404, 'NOT_FOUND')

  const b = (await req.json()) as any
  const sets: string[] = []
  const vals: any[] = []

  if (b.royaltyRate !== undefined) { sets.push('royaltyRate = ?'); vals.push(b.royaltyRate) }
  if (b.royaltyType !== undefined) {
    if (!['PERCENTAGE', 'FIXED'].includes(b.royaltyType)) return err('Invalid royaltyType', 400, 'INVALID_FIELD')
    sets.push('royaltyType = ?'); vals.push(b.royaltyType)
  }
  if (b.billingCycle !== undefined) {
    if (!['WEEKLY', 'MONTHLY'].includes(b.billingCycle)) return err('Invalid billingCycle', 400, 'INVALID_FIELD')
    sets.push('billingCycle = ?'); vals.push(b.billingCycle)
  }
  if (b.status !== undefined) {
    if (!isValidFranchiseTransition(row.status, b.status))
      return err(`Cannot transition from ${row.status} to ${b.status}`, 400, 'INVALID_STATE')
    sets.push('status = ?'); vals.push(b.status)
  }

  if (sets.length === 0) return err('No fields to update', 400, 'MISSING_FIELD')
  sets.push('updatedAt = ?'); vals.push(nowISO()); vals.push(id)

  await exec(`UPDATE Franchise SET ${sets.join(', ')} WHERE id = ?`, vals)
  return NextResponse.json({ ok: true })
}
