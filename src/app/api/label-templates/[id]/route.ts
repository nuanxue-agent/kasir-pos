import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { exec, queryOne, nowISO } from '@/lib/db'
import { ensureLabelTables } from '../route'

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

  await ensureLabelTables()

  const row = await queryOne(`SELECT * FROM LabelTemplate WHERE id = ?`, [id]) as any
  if (!row) return err('Template not found', 404, 'NOT_FOUND')

  const b = (await req.json()) as any

  const sets: string[] = []
  const vals: any[] = []

  if (b.name !== undefined) { sets.push('name = ?'); vals.push(b.name.trim()) }
  if (b.width !== undefined) { sets.push('width = ?'); vals.push(b.width) }
  if (b.height !== undefined) { sets.push('height = ?'); vals.push(b.height) }
  if (b.fields !== undefined) { sets.push('fields = ?'); vals.push(JSON.stringify(b.fields)) }
  if (b.active !== undefined) { sets.push('active = ?'); vals.push(b.active ? 1 : 0) }

  if (sets.length === 0) return err('No fields to update', 400, 'MISSING_FIELD')

  sets.push('updatedAt = ?')
  vals.push(nowISO())
  vals.push(id)

  await exec(`UPDATE LabelTemplate SET ${sets.join(', ')} WHERE id = ?`, vals)

  return NextResponse.json({ ok: true })
}
