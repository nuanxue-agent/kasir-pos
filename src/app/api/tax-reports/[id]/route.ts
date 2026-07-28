import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, nowISO } from '@/lib/db'
import { ensureTaxTables } from '../route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

const VALID_STATUSES = ['DRAFT', 'FILED', 'PAID']

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureTaxTables()

  const existing = (await query(
    `SELECT * FROM TaxReport WHERE id = ? AND storeId = ?`,
    [id, storeId],
  )) as any[]
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
    if (b.status === 'FILED') {
      sets.push('filedAt = ?')
      vals.push(nowISO())
    }
  }

  if (b.totalTaxable !== undefined) { sets.push('totalTaxable = ?'); vals.push(Number(b.totalTaxable)) }
  if (b.taxAmount    !== undefined) { sets.push('taxAmount = ?');    vals.push(Number(b.taxAmount)) }
  if (b.dueDate      !== undefined) { sets.push('dueDate = ?');      vals.push(b.dueDate) }

  if (sets.length === 0) return err('No fields to update')

  sets.push('updatedAt = ?')
  vals.push(nowISO())
  vals.push(id)

  await exec(`UPDATE TaxReport SET ${sets.join(', ')} WHERE id = ?`, vals)

  const updated = (await query(`SELECT * FROM TaxReport WHERE id = ?`, [id])) as any[]
  return NextResponse.json(updated[0])
}
