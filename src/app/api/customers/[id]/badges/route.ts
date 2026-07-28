// GET /api/customers/:id/badges
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

async function ensureTables() {
  await exec(`
    CREATE TABLE IF NOT EXISTS CustomerBadge (
      id         TEXT PRIMARY KEY,
      customerId TEXT NOT NULL,
      storeId    TEXT NOT NULL,
      badge      TEXT NOT NULL,
      earnedAt   TEXT NOT NULL
    )
  `)
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureTables()

  const { id: customerId } = await params

  const rows = await query(
    `SELECT * FROM CustomerBadge WHERE customerId=? AND storeId=? ORDER BY earnedAt DESC`,
    [customerId, storeId],
  )
  return NextResponse.json(rows)
}
