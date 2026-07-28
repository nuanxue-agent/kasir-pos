// PATCH /api/replenishment-configs/[id]
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { exec, nowISO } from '@/lib/db'
import { ensureReplenishmentTables } from '../route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')

  const { id } = await params
  await ensureReplenishmentTables()

  const b = (await req.json()) as any
  const setClauses: string[] = []
  const values: any[] = []

  if (b.active !== undefined) {
    setClauses.push('active = ?')
    values.push(b.active ? 1 : 0)
  }
  if (b.minStock !== undefined)     { setClauses.push('minStock = ?');     values.push(b.minStock) }
  if (b.maxStock !== undefined)     { setClauses.push('maxStock = ?');     values.push(b.maxStock) }
  if (b.reorderPoint !== undefined) { setClauses.push('reorderPoint = ?'); values.push(b.reorderPoint) }
  if (b.leadTimeDays !== undefined) { setClauses.push('leadTimeDays = ?'); values.push(b.leadTimeDays) }
  if (b.safetyStock !== undefined)  { setClauses.push('safetyStock = ?');  values.push(b.safetyStock) }
  if (b.vendorId !== undefined)     { setClauses.push('vendorId = ?');     values.push(b.vendorId) }

  if (setClauses.length === 0) return err('No fields to update', 400, 'NO_FIELDS')

  setClauses.push('updatedAt = ?')
  values.push(nowISO())
  values.push(id)

  await exec(
    `UPDATE ReplenishmentConfig SET ${setClauses.join(', ')} WHERE id = ?`,
    values
  )

  return NextResponse.json({ ok: true })
}
