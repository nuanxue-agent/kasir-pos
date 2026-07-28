import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { exec, queryOne, nowISO } from '@/lib/db'
import { ensureSupplierContractTables } from '../route'

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

  await ensureSupplierContractTables()

  const existing = await queryOne(`SELECT * FROM SupplierContract WHERE id = ?`, [id]) as any
  if (!existing) return err('Contract not found', 404, 'NOT_FOUND')

  const b = (await req.json()) as any

  const validStatuses = ['ACTIVE', 'EXPIRED', 'DRAFT', 'TERMINATED']
  if (b.status !== undefined && !validStatuses.includes(b.status)) {
    return err('Invalid status', 400, 'INVALID_FIELD')
  }

  const sets: string[] = []
  const vals: any[] = []

  if (b.vendorId !== undefined)      { sets.push('vendorId = ?');      vals.push(b.vendorId) }
  if (b.contractNumber !== undefined){ sets.push('contractNumber = ?');vals.push(b.contractNumber) }
  if (b.startDate !== undefined)     { sets.push('startDate = ?');     vals.push(b.startDate) }
  if (b.endDate !== undefined)       { sets.push('endDate = ?');       vals.push(b.endDate) }
  if (b.paymentTerms !== undefined)  { sets.push('paymentTerms = ?'); vals.push(b.paymentTerms) }
  if (b.status !== undefined)        { sets.push('status = ?');        vals.push(b.status) }
  if (b.notes !== undefined)         { sets.push('notes = ?');         vals.push(b.notes) }

  if (sets.length === 0) return err('No fields to update', 400, 'MISSING_FIELD')

  sets.push('updatedAt = ?')
  vals.push(nowISO())
  vals.push(id)

  await exec(`UPDATE SupplierContract SET ${sets.join(', ')} WHERE id = ?`, vals)
  return NextResponse.json({ ok: true })
}
