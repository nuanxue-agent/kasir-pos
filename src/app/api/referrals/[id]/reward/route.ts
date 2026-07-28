// POST /api/referrals/:id/reward
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { queryOne, exec } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  const { id: refId } = await params

  const referral = await queryOne<any>(
    `SELECT cr.*, rp.rewardType, rp.rewardAmount
     FROM CustomerReferral cr
     JOIN ReferralProgram rp ON rp.id = cr.programId
     WHERE cr.id=? AND cr.storeId=?`,
    [refId, storeId],
  )
  if (!referral) return err('Referral not found', 404, 'NOT_FOUND')
  if (referral.status !== 'QUALIFIED') {
    return err('Referral must be QUALIFIED before rewarding', 400, 'INVALID_TRANSITION')
  }
  await exec(`UPDATE CustomerReferral SET status='REWARDED' WHERE id=?`, [refId])
  return NextResponse.json({
    rewarded: true,
    rewardType: referral.rewardType,
    rewardAmount: referral.rewardAmount,
  })
}
