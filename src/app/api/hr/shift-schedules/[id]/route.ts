import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { exec, nowISO } from '@/lib/db'
import { ensureShiftScheduleTables } from '../route'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)

  const { id } = await params
  await ensureShiftScheduleTables()

  const b = (await req.json()) as any

  const validStatuses = ['SCHEDULED', 'CONFIRMED', 'SWAPPED', 'ABSENT']
  const fields: string[] = []
  const values: any[] = []

  if (b.status !== undefined) {
    if (!validStatuses.includes(b.status)) {
      return err(`status must be one of ${validStatuses.join(', ')}`)
    }
    fields.push('status = ?')
    values.push(b.status)
  }
  if (b.shiftId !== undefined) { fields.push('shiftId = ?'); values.push(b.shiftId) }
  if (b.dayOfWeek !== undefined) {
    if (b.dayOfWeek < 0 || b.dayOfWeek > 6) return err('dayOfWeek must be 0–6')
    fields.push('dayOfWeek = ?'); values.push(b.dayOfWeek)
  }

  if (fields.length === 0) return err('No fields to update')

  fields.push('updatedAt = ?')
  values.push(nowISO())
  values.push(id)

  await exec(`UPDATE ShiftSchedule SET ${fields.join(', ')} WHERE id = ?`, values)
  return NextResponse.json({ ok: true })
}
