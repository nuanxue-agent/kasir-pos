// PATCH /api/branches/[id]
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { exec, nowISO } from '@/lib/db'
import { ensureBranchTable } from '../route'

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
  await ensureBranchTable()

  const b = (await req.json()) as any

  const sets: string[] = []
  const vals: any[] = []

  if (b.name !== undefined)      { sets.push('name = ?');      vals.push(b.name) }
  if (b.address !== undefined)   { sets.push('address = ?');   vals.push(b.address) }
  if (b.phone !== undefined)     { sets.push('phone = ?');     vals.push(b.phone) }
  if (b.managerId !== undefined) { sets.push('managerId = ?'); vals.push(b.managerId) }
  if (b.timezone !== undefined)  { sets.push('timezone = ?');  vals.push(b.timezone) }
  if (b.currency !== undefined)  { sets.push('currency = ?');  vals.push(b.currency) }
  if (b.active !== undefined)    { sets.push('active = ?');    vals.push(b.active ? 1 : 0) }

  if (sets.length === 0) return err('No fields to update', 400, 'NO_FIELDS')

  sets.push('updatedAt = ?')
  vals.push(nowISO())
  vals.push(id)

  await exec(`UPDATE Branch SET ${sets.join(', ')} WHERE id = ?`, vals)
  return NextResponse.json({ ok: true })
}
