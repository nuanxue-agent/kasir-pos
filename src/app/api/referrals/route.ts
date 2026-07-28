// GET /api/referrals?storeId=
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec } from '@/lib/db'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
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

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400)

  await ensureTables()

  const rows = await query(
    `SELECT cr.*,
            ref.name AS referrerName,
            ref2.name AS refereeName
     FROM CustomerReferral cr
     LEFT JOIN Customer ref  ON ref.id  = cr.referrerId
     LEFT JOIN Customer ref2 ON ref2.id = cr.refereeId
     WHERE cr.storeId = ?
     ORDER BY cr.createdAt DESC`,
    [storeId],
  )
  return NextResponse.json(rows)
}
