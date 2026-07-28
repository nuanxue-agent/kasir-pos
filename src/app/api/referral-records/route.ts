import { NextRequest, NextResponse } from 'next/server'
import { query, exec, queryOne, newId, nowISO } from '@/lib/db'
import { ensureReferralProgramTables } from '../referral-programs/route'
import { generateProgramReferralCode } from '@/lib/referral-program'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function GET(req: NextRequest) {
  try {
    await ensureReferralProgramTables()
    const sp = req.nextUrl.searchParams
    const storeId   = sp.get('storeId')
    const programId = sp.get('programId')
    const status    = sp.get('status')
    if (!storeId) return err('storeId required')

    let sql = `SELECT * FROM ReferralRecord WHERE storeId = ?`
    const params: any[] = [storeId]
    if (programId) { sql += ' AND programId = ?'; params.push(programId) }
    if (status)    { sql += ' AND status = ?';    params.push(status) }
    sql += ' ORDER BY createdAt DESC'

    const rows = await query(sql, params)
    return NextResponse.json(rows)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureReferralProgramTables()
    const b = await req.json() as any
    const { programId, storeId, referrerId, refereeId = null, customerPrefix = '' } = b

    if (!programId || !storeId || !referrerId) {
      return err('programId, storeId, and referrerId are required')
    }

    // Validate program exists and is active
    const program = await queryOne(
      `SELECT * FROM ReferralProgram WHERE id = ? AND storeId = ?`,
      [programId, storeId],
    )
    if (!program) return err('Program not found', 404)
    if (!program.active) return err('Program is not active')

    // Prevent duplicate referee
    if (refereeId) {
      const duplicate = await queryOne(
        `SELECT id FROM ReferralRecord WHERE storeId = ? AND refereeId = ?`,
        [storeId, refereeId],
      )
      if (duplicate) return err('Pelanggan ini sudah pernah direferensikan')
    }

    const referralCode = generateProgramReferralCode(customerPrefix)
    const id = newId()
    const now = nowISO()

    await exec(
      `INSERT INTO ReferralRecord
        (id, programId, storeId, referrerId, refereeId, referralCode, status, qualifiedAt, rewardedAt, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, 'PENDING', NULL, NULL, ?)`,
      [id, programId, storeId, referrerId, refereeId, referralCode, now],
    )
    return NextResponse.json({ id, referralCode }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
