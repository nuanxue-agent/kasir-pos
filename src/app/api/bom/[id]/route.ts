import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, nowISO } from '@/lib/db'
import { ensureBOMTable } from '../route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const { id } = await params
  const b = (await req.json()) as any
  const storeId = b.storeId ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureBOMTable()

  const rows = await query(
    `SELECT * FROM BillOfMaterials WHERE id = ? AND storeId = ?`,
    [id, storeId],
  ) as any[]
  if (!rows.length) return err('BOM entry not found', 404, 'NOT_FOUND')

  const updates: string[] = []
  const vals: any[] = []

  if (b.qty !== undefined) {
    const qty = Number(b.qty)
    if (qty <= 0) return err("'qty' must be positive", 400, 'INVALID_FIELD')
    updates.push('qty = ?'); vals.push(qty)
  }
  if (b.unit !== undefined) { updates.push('unit = ?'); vals.push(b.unit) }

  if (!updates.length) return err('No fields to update', 400, 'NO_UPDATES')

  vals.push(id)
  await exec(`UPDATE BillOfMaterials SET ${updates.join(', ')} WHERE id = ?`, vals)

  const [updated] = await query(`SELECT * FROM BillOfMaterials WHERE id = ?`, [id]) as any[]
  return NextResponse.json(updated)
}
