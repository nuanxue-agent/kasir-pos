// PATCH /api/kits/[id]
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, nowISO } from '@/lib/db'
import { ensureKitTables } from '../route'

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

  await ensureKitTables()

  const rows = await query(`SELECT * FROM Kit WHERE id = ?`, [id])
  const kit = (rows as any[])[0]
  if (!kit) return err('Kit not found', 404, 'NOT_FOUND')

  const b = (await req.json()) as any

  const sets: string[] = []
  const vals: any[]    = []

  if (b.name             !== undefined) { sets.push('name = ?');             vals.push(b.name) }
  if (b.outputProductId  !== undefined) { sets.push('outputProductId = ?');  vals.push(b.outputProductId) }
  if (b.outputQty        !== undefined) {
    const qty = Number(b.outputQty)
    if (qty <= 0) return err("'outputQty' must be positive", 400, 'INVALID_FIELD')
    sets.push('outputQty = ?')
    vals.push(qty)
  }
  if (b.instructions !== undefined) { sets.push('instructions = ?'); vals.push(b.instructions) }
  if (b.active       !== undefined) { sets.push('active = ?');       vals.push(b.active ? 1 : 0) }

  if (sets.length === 0) return err('No fields to update', 400, 'NO_FIELDS')

  sets.push('updatedAt = ?')
  vals.push(nowISO())
  vals.push(id)

  await exec(`UPDATE Kit SET ${sets.join(', ')} WHERE id = ?`, vals)
  return NextResponse.json({ ok: true })
}
