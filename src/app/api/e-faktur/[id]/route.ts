import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, nowISO } from '@/lib/db'
import { ensureEFakturTables } from '../route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

const VALID_STATUSES = ['DRAFT', 'UPLOADED', 'ACCEPTED', 'REJECTED']

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')

  await ensureEFakturTables()

  const existing = (await query(`SELECT * FROM EFaktur WHERE id = ?`, [id])) as any[]
  if (existing.length === 0) return err('Not found', 404, 'NOT_FOUND')

  const b = (await req.json()) as any

  const sets: string[] = []
  const vals: any[] = []

  if (b.status !== undefined) {
    if (!VALID_STATUSES.includes(b.status)) {
      return err(`Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`, 400, 'INVALID_FIELD')
    }
    sets.push('status = ?')
    vals.push(b.status)
    if (b.status === 'UPLOADED') {
      sets.push('uploadedAt = ?')
      vals.push(nowISO())
    }
  }

  if (b.buyerNpwp !== undefined) { sets.push('buyerNpwp = ?'); vals.push(b.buyerNpwp) }
  if (b.buyerName !== undefined) { sets.push('buyerName = ?'); vals.push(b.buyerName) }
  if (b.taxBase !== undefined) { sets.push('taxBase = ?'); vals.push(Number(b.taxBase)) }
  if (b.taxAmount !== undefined) { sets.push('taxAmount = ?'); vals.push(Number(b.taxAmount)) }
  if (b.invoiceNumber !== undefined) { sets.push('invoiceNumber = ?'); vals.push(b.invoiceNumber) }

  if (sets.length === 0) return err('No fields to update')

  sets.push('updatedAt = ?')
  vals.push(nowISO())
  vals.push(id)

  await exec(`UPDATE EFaktur SET ${sets.join(', ')} WHERE id = ?`, vals)

  return NextResponse.json({ ok: true })
}
