// PATCH /api/birthday-automations/[id]
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { exec, nowISO } from '@/lib/db'
import { ensureBirthdayTables } from '../route'

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
  await ensureBirthdayTables()

  const b = (await req.json()) as any

  const sets: string[] = []
  const vals: any[] = []

  if (b.triggerType !== undefined) {
    if (!['BIRTHDAY', 'ANNIVERSARY', 'SIGNUP_ANNIVERSARY'].includes(b.triggerType))
      return err('Invalid triggerType', 400, 'INVALID_FIELD')
    sets.push('triggerType = ?'); vals.push(b.triggerType)
  }
  if (b.daysBeforeTrigger !== undefined) { sets.push('daysBeforeTrigger = ?'); vals.push(Number(b.daysBeforeTrigger)) }
  if (b.rewardType !== undefined) {
    if (!['VOUCHER', 'POINTS', 'DISCOUNT'].includes(b.rewardType))
      return err('Invalid rewardType', 400, 'INVALID_FIELD')
    sets.push('rewardType = ?'); vals.push(b.rewardType)
  }
  if (b.rewardValue !== undefined) { sets.push('rewardValue = ?'); vals.push(Number(b.rewardValue)) }
  if (b.message !== undefined) { sets.push('message = ?'); vals.push(b.message) }
  if (b.active !== undefined) { sets.push('active = ?'); vals.push(b.active ? 1 : 0) }

  if (sets.length === 0) return err('No fields to update', 400, 'MISSING_FIELD')

  sets.push('updatedAt = ?'); vals.push(nowISO()); vals.push(id)

  await exec(`UPDATE BirthdayAutomation SET ${sets.join(', ')} WHERE id = ?`, vals)
  return NextResponse.json({ ok: true })
}
