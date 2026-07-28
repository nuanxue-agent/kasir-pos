// PATCH /api/reorder-rules/[id]
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { exec, nowISO } from '@/lib/db'
import { ensureReorderTables } from '../route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')

  const { id } = await params
  await ensureReorderTables()

  const b = (await req.json()) as any

  const sets: string[] = []
  const vals: any[] = []

  if (b.reorderPoint !== undefined) { sets.push('reorderPoint = ?'); vals.push(b.reorderPoint) }
  if (b.reorderQty !== undefined) { sets.push('reorderQty = ?'); vals.push(b.reorderQty) }
  if (b.leadTimeDays !== undefined) { sets.push('leadTimeDays = ?'); vals.push(b.leadTimeDays) }
  if (b.preferredVendorId !== undefined) { sets.push('preferredVendorId = ?'); vals.push(b.preferredVendorId) }
  if (b.active !== undefined) { sets.push('active = ?'); vals.push(b.active ? 1 : 0) }

  if (sets.length === 0) return err('No fields to update', 400, 'NO_FIELDS')

  sets.push('updatedAt = ?')
  vals.push(nowISO())
  vals.push(id)

  await exec(`UPDATE ReorderRule SET ${sets.join(', ')} WHERE id = ?`, vals)
  return NextResponse.json({ ok: true })
}
