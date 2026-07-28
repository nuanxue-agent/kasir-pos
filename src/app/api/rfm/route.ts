// GET /api/rfm?storeId= — list CustomerRFM rows with customer details
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec } from '@/lib/db'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function ensureRFMTable() {
  await exec(`
    CREATE TABLE IF NOT EXISTS CustomerRFM (
      id               TEXT PRIMARY KEY,
      storeId          TEXT NOT NULL,
      customerId       TEXT NOT NULL,
      recencyDays      INTEGER NOT NULL DEFAULT 0,
      frequencyCount   INTEGER NOT NULL DEFAULT 0,
      monetaryTotal    REAL NOT NULL DEFAULT 0,
      recencyScore     INTEGER NOT NULL DEFAULT 3,
      frequencyScore   INTEGER NOT NULL DEFAULT 3,
      monetaryScore    INTEGER NOT NULL DEFAULT 3,
      rfmScore         INTEGER NOT NULL DEFAULT 9,
      segment          TEXT NOT NULL DEFAULT 'New',
      computedAt       TEXT NOT NULL
    )
  `)
  await exec(
    `CREATE INDEX IF NOT EXISTS CustomerRFM_store ON CustomerRFM(storeId)`,
  ).catch(() => {})
  await exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS CustomerRFM_store_customer ON CustomerRFM(storeId, customerId)`,
  ).catch(() => {})
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)
  const user = session.user as any

  const storeId =
    req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400)

  const segment = req.nextUrl.searchParams.get('segment')

  await ensureRFMTable()

  const baseQuery = segment
    ? `SELECT r.*, c.name, c.phone, c.email
       FROM CustomerRFM r
       LEFT JOIN Customer c ON c.id = r.customerId
       WHERE r.storeId = ? AND r.segment = ?
       ORDER BY r.rfmScore DESC`
    : `SELECT r.*, c.name, c.phone, c.email
       FROM CustomerRFM r
       LEFT JOIN Customer c ON c.id = r.customerId
       WHERE r.storeId = ?
       ORDER BY r.rfmScore DESC`

  const params = segment ? [storeId, segment] : [storeId]
  const rows = await query(baseQuery, params)
  return NextResponse.json(rows)
}
