import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, nowISO } from '@/lib/db'
import { ensureReservationTables } from '../route'
import { isValidTransition, type ReservationStatus } from '@/lib/reservations'

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

  const existing = await query(`SELECT * FROM Reservation WHERE id = ? AND storeId = ?`, [id, storeId])
  if (!(existing as any[]).length) return err('Reservation not found', 404, 'NOT_FOUND')

  const current = (existing as any[])[0]

  // Status transition validation
  if (body.status && body.status !== current.status) {
    if (!isValidTransition(current.status as ReservationStatus, body.status as ReservationStatus)) {
      return err(`Cannot transition from ${current.status} to ${body.status}`, 400, 'INVALID_TRANSITION')
    }
  }

  const fields: string[] = []
  const values: any[] = []

  if (body.status !== undefined)        { fields.push('status = ?');        values.push(body.status) }
  if (body.customerName !== undefined)  { fields.push('customerName = ?');  values.push(body.customerName) }
  if (body.customerPhone !== undefined) { fields.push('customerPhone = ?'); values.push(body.customerPhone) }
  if (body.tableId !== undefined)       { fields.push('tableId = ?');       values.push(body.tableId) }
  if (body.partySize !== undefined)     { fields.push('partySize = ?');     values.push(body.partySize) }
  if (body.date !== undefined)          { fields.push('date = ?');          values.push(body.date) }
  if (body.timeSlot !== undefined)      { fields.push('timeSlot = ?');      values.push(body.timeSlot) }
  if (body.notes !== undefined)         { fields.push('notes = ?');         values.push(body.notes) }

  if (!fields.length) return err('No fields to update', 400, 'MISSING_FIELD')

  values.push(id)
  await exec(`UPDATE Reservation SET ${fields.join(', ')} WHERE id = ?`, values)

  const updated = await query(`SELECT * FROM Reservation WHERE id = ?`, [id])
  return NextResponse.json((updated as any[])[0])
}
