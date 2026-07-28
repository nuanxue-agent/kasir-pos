// POST /api/referrals/track
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { queryOne, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

async function ensureTables() {
  await exec(`
    CREATE TABLE IF NOT EXISTS CustomerReferral (
      id          TEXT PRIMARY KEY,
      programId   TEXT NOT NULL,
      referrerId  TEXT NOT NULL,
      refereeId   TEXT,
      referralCode TEXT NOT NULL,
      storeId     TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'PENDING',
      createdAt   TEXT NOT NULL
    )
  `)
  await exec(`ALTER TABLE Customer ADD COLUMN referralCode TEXT`, []).catch(() => {})
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureTables()

  const b = (await req.json()) as any
  if (!b.referralCode) return err("Field 'referralCode' is required", 400, 'MISSING_FIELD')
  if (!b.refereePhone) return err("Field 'refereePhone' is required", 400, 'MISSING_FIELD')

  // Find referrer by referralCode
  const referrer = await queryOne<any>(
    `SELECT * FROM Customer WHERE referralCode=? AND storeId=?`,
    [b.referralCode, storeId],
  )
  if (!referrer) return err('Kode referral tidak valid', 404, 'NOT_FOUND')

  // Find referee by phone
  const referee = await queryOne<any>(`SELECT * FROM Customer WHERE phone=? AND storeId=?`, [
    b.refereePhone,
    storeId,
  ])
  if (!referee) return err('Pelanggan referee tidak ditemukan', 404, 'NOT_FOUND')

  if (referee.id === referrer.id) {
    return err('Pelanggan tidak bisa mereferral diri sendiri', 400, 'SELF_REFERRAL')
  }

  // Duplicate: referee already referred by anyone
  const alreadyReferred = await queryOne(
    `SELECT id FROM CustomerReferral WHERE refereeId=? AND storeId=?`,
    [referee.id, storeId],
  )
  if (alreadyReferred) return err('Pelanggan sudah pernah direferral', 409, 'DUPLICATE_REFERRAL')

  // Duplicate: same referrer→referee pair
  const dupPair = await queryOne(
    `SELECT id FROM CustomerReferral WHERE referrerId=? AND refereeId=? AND storeId=?`,
    [referrer.id, referee.id, storeId],
  )
  if (dupPair) return err('Referral ini sudah tercatat', 409, 'DUPLICATE_REFERRAL')

  // Find active program
  const program = await queryOne<any>(
    `SELECT * FROM ReferralProgram WHERE storeId=? AND active=1 LIMIT 1`,
    [storeId],
  )
  if (!program) return err('Tidak ada program referral aktif', 400, 'NO_ACTIVE_PROGRAM')

  const id = newId()
  const t = nowISO()
  await exec(
    `INSERT INTO CustomerReferral (id,programId,referrerId,refereeId,referralCode,storeId,status,createdAt)
     VALUES (?,?,?,?,?,?,?,?)`,
    [id, program.id, referrer.id, referee.id, b.referralCode, storeId, 'QUALIFIED', t],
  )
  return NextResponse.json(
    { id, status: 'QUALIFIED', referrerId: referrer.id, refereeId: referee.id },
    { status: 201 },
  )
}
