import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'
import { ensureReservationTables } from '../route'
import { findAvailableTables, type TableLayout, type ReservationRow } from '@/lib/reservations'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any
  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  const date = req.nextUrl.searchParams.get('date')
  const timeSlot = req.nextUrl.searchParams.get('timeSlot')
  const partySizeStr = req.nextUrl.searchParams.get('partySize')

  if (!date || !timeSlot || !partySizeStr) {
    return err('date, timeSlot, partySize required', 400, 'MISSING_FIELD')
  }
  const partySize = parseInt(partySizeStr, 10)
  if (isNaN(partySize) || partySize < 1) return err('partySize must be a positive integer', 400, 'INVALID_PARAM')

  await ensureReservationTables()

  const tables = await query(
    `SELECT * FROM TableLayout WHERE storeId = ? AND active = 1`,
    [storeId],
  )
  const reservations = await query(
    `SELECT * FROM Reservation WHERE storeId = ? AND date = ? AND timeSlot = ?`,
    [storeId, date, timeSlot],
  )

  const available = findAvailableTables(
    (tables as any[]) as TableLayout[],
    (reservations as any[]) as ReservationRow[],
    date,
    timeSlot,
    partySize,
  )

  return NextResponse.json(available.map(t => ({ ...t, active: Boolean(t.active) })))
}
