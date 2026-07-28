import { NextRequest, NextResponse } from 'next/server'
import { exec, queryOne, nowISO } from '@/lib/db'
import { ensureReferralProgramTables } from '../../referral-programs/route'
import { isValidRecordTransition } from '@/lib/referral-program'
import type { ReferralRecordStatus } from '@/lib/referral-program'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

// PATCH /api/referral-records/[id]
// body: { status: 'QUALIFIED' | 'REWARDED', purchaseAmount?: number }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await ensureReferralProgramTables()
    const { id } = await params
    const b = await req.json() as any
    const { status: nextStatus, purchaseAmount } = b

    if (!nextStatus) return err('status is required')

    const record = await queryOne(
      `SELECT * FROM ReferralRecord WHERE id = ?`,
      [id],
    )
    if (!record) return err('Record not found', 404)

    const current = record.status as ReferralRecordStatus
    if (!isValidRecordTransition(current, nextStatus as ReferralRecordStatus)) {
      return err(`Transisi status tidak valid: ${current} → ${nextStatus}`)
    }

    // If qualifying, optionally validate min purchase
    if (nextStatus === 'QUALIFIED') {
      const program = await queryOne(
        `SELECT * FROM ReferralProgram WHERE id = ?`,
        [record.programId],
      )
      if (program && purchaseAmount !== undefined) {
        if (purchaseAmount < program.minPurchaseAmount) {
          return err(
            `Pembelian minimum Rp${program.minPurchaseAmount.toLocaleString('id-ID')} diperlukan`,
          )
        }
      }
    }

    const now = nowISO()
    const qualifiedAt = nextStatus === 'QUALIFIED' ? now : record.qualifiedAt
    const rewardedAt  = nextStatus === 'REWARDED'  ? now : record.rewardedAt

    await exec(
      `UPDATE ReferralRecord SET status = ?, qualifiedAt = ?, rewardedAt = ? WHERE id = ?`,
      [nextStatus, qualifiedAt, rewardedAt, id],
    )
    return NextResponse.json({ id, status: nextStatus })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
