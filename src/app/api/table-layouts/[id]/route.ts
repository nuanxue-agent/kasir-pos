import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec } from '@/lib/db'
import { ensureReservationTables } from '../../reservations/route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any
  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  const { id } = await params
  const body = await req.json() as any

  await ensureReservationTables()

  const existing = await query(`SELECT * FROM TableLayout WHERE id = ? AND storeId = ?`, [id, storeId])
  if (!(existing as any[]).length) return err('Table not found', 404, 'NOT_FOUND')

  const fields: string[] = []
  const values: any[] = []

  if (body.number !== undefined)   { fields.push('number = ?');   values.push(body.number) }
  if (body.capacity !== undefined) { fields.push('capacity = ?'); values.push(body.capacity) }
  if (body.section !== undefined)  { fields.push('section = ?');  values.push(body.section) }
  if (body.active !== undefined)   { fields.push('active = ?');   values.push(body.active ? 1 : 0) }

  if (!fields.length) return err('No fields to update', 400, 'MISSING_FIELD')

  values.push(id)
  await exec(`UPDATE TableLayout SET ${fields.join(', ')} WHERE id = ?`, values)

  const updated = await query(`SELECT * FROM TableLayout WHERE id = ?`, [id])
  const r = (updated as any[])[0]
  return NextResponse.json({ ...r, active: Boolean(r.active) })
}
