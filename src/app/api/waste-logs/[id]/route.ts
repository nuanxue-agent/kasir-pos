import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { exec, nowISO } from '@/lib/db'

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
  const b = (await req.json()) as any

  const sets: string[] = []
  const vals: any[] = []

  if (b.qty !== undefined) { sets.push('qty = ?'); vals.push(parseFloat(b.qty)) }
  if (b.reason !== undefined) {
    const valid = ['EXPIRED', 'DAMAGED', 'SPOILED', 'RETURNED', 'OTHER']
    if (!valid.includes(b.reason)) return err('Invalid reason', 400, 'INVALID_FIELD')
    sets.push('reason = ?'); vals.push(b.reason)
  }
  if (b.cost !== undefined) { sets.push('cost = ?'); vals.push(parseFloat(b.cost)) }
  if (b.notes !== undefined) { sets.push('notes = ?'); vals.push(b.notes) }

  if (sets.length === 0) return err('No fields to update', 400, 'NO_FIELDS')

  vals.push(id)
  await exec(`UPDATE WasteLog SET ${sets.join(', ')} WHERE id = ?`, vals)
  return NextResponse.json({ ok: true })
}
