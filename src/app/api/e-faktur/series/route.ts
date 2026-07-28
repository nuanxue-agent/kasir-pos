import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import { ensureEFakturTables } from '../route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureEFakturTables()

  const rows = await query(
    `SELECT * FROM FakturSeries WHERE storeId = ? ORDER BY year DESC, month DESC`,
    [storeId],
  )

  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureEFakturTables()

  const b = (await req.json()) as any

  const now = new Date()
  const year = b.year ?? now.getFullYear()
  const month = b.month ?? (now.getMonth() + 1)
  const prefix = b.prefix ?? '010.000'
  const startNumber = b.startNumber ?? 0

  if (month < 1 || month > 12) return err('month must be 1–12', 400, 'INVALID_FIELD')

  // Check if series already exists for this period
  const existing = await query(
    `SELECT id FROM FakturSeries WHERE storeId = ? AND year = ? AND month = ? LIMIT 1`,
    [storeId, year, month],
  )
  if ((existing as any[]).length > 0) {
    return err('Series for this period already exists', 400, 'DUPLICATE')
  }

  const t = nowISO()
  const id = newId()
  await exec(
    `INSERT INTO FakturSeries (id, storeId, prefix, lastNumber, year, month, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, storeId, prefix, startNumber, year, month, t, t],
  )

  return NextResponse.json({ id }, { status: 201 })
}
