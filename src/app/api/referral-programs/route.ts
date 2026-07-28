import { NextRequest, NextResponse } from 'next/server'
import { query, exec, newId, nowISO } from '@/lib/db'

export async function ensureReferralProgramTables() {
  await exec(`CREATE TABLE IF NOT EXISTS ReferralProgram (
    id TEXT PRIMARY KEY,
    storeId TEXT NOT NULL,
    name TEXT NOT NULL,
    rewardType TEXT NOT NULL DEFAULT 'POINTS',
    rewardValue REAL NOT NULL DEFAULT 0,
    referrerReward REAL NOT NULL DEFAULT 0,
    refereeReward REAL NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    minPurchaseAmount REAL NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS ReferralRecord (
    id TEXT PRIMARY KEY,
    programId TEXT NOT NULL,
    storeId TEXT NOT NULL,
    referrerId TEXT NOT NULL,
    refereeId TEXT,
    referralCode TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    qualifiedAt TEXT,
    rewardedAt TEXT,
    createdAt TEXT NOT NULL
  )`)
}

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function GET(req: NextRequest) {
  try {
    await ensureReferralProgramTables()
    const sp = req.nextUrl.searchParams
    const storeId = sp.get('storeId')
    if (!storeId) return err('storeId required')

    const rows = await query(
      `SELECT * FROM ReferralProgram WHERE storeId = ? ORDER BY createdAt DESC`,
      [storeId],
    )
    return NextResponse.json(rows)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureReferralProgramTables()
    const b = await req.json() as any
    const {
      storeId,
      name,
      rewardType = 'POINTS',
      rewardValue = 0,
      referrerReward = 0,
      refereeReward = 0,
      active = true,
      minPurchaseAmount = 0,
    } = b

    if (!storeId || !name) return err('storeId and name are required')
    if (!['POINTS', 'VOUCHER', 'DISCOUNT'].includes(rewardType)) {
      return err('rewardType must be POINTS, VOUCHER, or DISCOUNT')
    }

    const id = newId()
    const now = nowISO()
    await exec(
      `INSERT INTO ReferralProgram
        (id, storeId, name, rewardType, rewardValue, referrerReward, refereeReward, active, minPurchaseAmount, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, storeId, name, rewardType, rewardValue, referrerReward, refereeReward, active ? 1 : 0, minPurchaseAmount, now, now],
    )
    return NextResponse.json({ id }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
