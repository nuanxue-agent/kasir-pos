import { NextRequest, NextResponse } from 'next/server'
import { exec, queryOne, nowISO } from '@/lib/db'
import { ensureReferralProgramTables } from '../route'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await ensureReferralProgramTables()
    const { id } = await params
    const b = await req.json() as any

    const existing = await queryOne(
      `SELECT * FROM ReferralProgram WHERE id = ?`,
      [id],
    )
    if (!existing) return err('Program not found', 404)

    const name            = b.name            ?? existing.name
    const rewardType      = b.rewardType      ?? existing.rewardType
    const rewardValue     = b.rewardValue     ?? existing.rewardValue
    const referrerReward  = b.referrerReward  ?? existing.referrerReward
    const refereeReward   = b.refereeReward   ?? existing.refereeReward
    const active          = b.active          !== undefined ? (b.active ? 1 : 0) : existing.active
    const minPurchaseAmount = b.minPurchaseAmount ?? existing.minPurchaseAmount
    const now = nowISO()

    await exec(
      `UPDATE ReferralProgram
       SET name = ?, rewardType = ?, rewardValue = ?, referrerReward = ?, refereeReward = ?,
           active = ?, minPurchaseAmount = ?, updatedAt = ?
       WHERE id = ?`,
      [name, rewardType, rewardValue, referrerReward, refereeReward, active, minPurchaseAmount, now, id],
    )
    return NextResponse.json({ id })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
