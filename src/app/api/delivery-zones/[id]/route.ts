import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, nowISO } from '@/lib/db'
import { ensureDeliveryZoneTables } from '../route'

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

  await ensureDeliveryZoneTables()

  const rows = await query(`SELECT id FROM DeliveryZone WHERE id = ?`, [id])
  if (rows.length === 0) return err('Zone not found', 404, 'NOT_FOUND')

  const b = (await req.json()) as any

  const sets: string[] = []
  const vals: any[] = []

  if (b.name !== undefined) { sets.push('name = ?'); vals.push(String(b.name).trim()) }
  if (b.minDistance !== undefined) { sets.push('minDistance = ?'); vals.push(Number(b.minDistance)) }
  if (b.maxDistance !== undefined) { sets.push('maxDistance = ?'); vals.push(Number(b.maxDistance)) }
  if (b.fee !== undefined) { sets.push('fee = ?'); vals.push(Number(b.fee)) }
  if (b.estimatedMinutes !== undefined) { sets.push('estimatedMinutes = ?'); vals.push(Number(b.estimatedMinutes)) }
  if (b.active !== undefined) { sets.push('active = ?'); vals.push(b.active ? 1 : 0) }

  if (sets.length === 0) return err('No fields to update', 400, 'NO_FIELDS')

  sets.push('updatedAt = ?')
  vals.push(nowISO())
  vals.push(id)

  await exec(`UPDATE DeliveryZone SET ${sets.join(', ')} WHERE id = ?`, vals)

  return NextResponse.json({ ok: true })
}
