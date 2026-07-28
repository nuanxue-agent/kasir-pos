import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import { ensureReservationTables } from '../reservations/route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any
  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureReservationTables()

  const section = req.nextUrl.searchParams.get('section')
  let sql = `SELECT * FROM TableLayout WHERE storeId = ?`
  const params: any[] = [storeId]
  if (section) { sql += ` AND section = ?`; params.push(section) }
  sql += ` ORDER BY section, number`

  const rows = await query(sql, params)
  return NextResponse.json((rows as any[]).map(r => ({ ...r, active: Boolean(r.active) })))
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any
  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  const body = await req.json() as any
  const { number, capacity, section = '' } = body
  if (!number || !capacity) return err('number and capacity required', 400, 'MISSING_FIELD')

  await ensureReservationTables()

  const id = newId()
  const createdAt = nowISO()

  await exec(
    `INSERT INTO TableLayout (id, storeId, number, capacity, section, active, createdAt) VALUES (?, ?, ?, ?, ?, 1, ?)`,
    [id, storeId, number, capacity, section, createdAt],
  )

  const row = await query(`SELECT * FROM TableLayout WHERE id = ?`, [id])
  const r = (row as any[])[0]
  return NextResponse.json({ ...r, active: Boolean(r.active) }, { status: 201 })
}
