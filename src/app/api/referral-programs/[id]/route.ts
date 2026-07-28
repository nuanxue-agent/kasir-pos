// PATCH /api/referral-programs/:id
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { queryOne, exec } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

function buildUpdate(cols: Record<string, any>): { setClauses: string; values: any[] } {
  const setClauses = Object.keys(cols)
    .map(k => `${k} = ?`)
    .join(', ')
  const values = Object.values(cols)
  return { setClauses, values }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  const { id: progId } = await params

  const existing = await queryOne(`SELECT * FROM ReferralProgram WHERE id=? AND storeId=?`, [
    progId,
    storeId,
  ])
  if (!existing) return err('Program not found', 404, 'NOT_FOUND')

  const b = (await req.json()) as any
  const updates: Record<string, any> = {}
  if (b.active !== undefined) updates.active = b.active ? 1 : 0
  if (b.name !== undefined) updates.name = b.name
  if (b.rewardType !== undefined) updates.rewardType = b.rewardType
  if (b.rewardAmount !== undefined) updates.rewardAmount = Number(b.rewardAmount)
  if (Object.keys(updates).length === 0) return err('Nothing to update', 400, 'VALIDATION_ERROR')

  const { setClauses, values } = buildUpdate(updates)
  await exec(`UPDATE ReferralProgram SET ${setClauses} WHERE id=? AND storeId=?`, [
    ...values,
    progId,
    storeId,
  ])
  return NextResponse.json({ updated: true })
}
