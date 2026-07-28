// PATCH /api/reservations/:id
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { queryOne, exec, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

type ReservationStatus = 'PENDING' | 'CONFIRMED' | 'SEATED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW'

const VALID_TRANSITIONS: Record<ReservationStatus, ReservationStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['SEATED', 'CANCELLED', 'NO_SHOW'],
  SEATED: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
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

  const existing = await queryOne<any>(
    `SELECT * FROM Reservation WHERE id=? AND storeId=?`,
    [id, storeId],
  )
  if (!existing) return err('Reservation not found', 404, 'NOT_FOUND')

  const b = (await req.json()) as any
  const updates: Record<string, any> = {}

  if (b.status !== undefined) {
    const from = existing.status as ReservationStatus
    const to = b.status as ReservationStatus
    if (!VALID_TRANSITIONS[from]?.includes(to)) {
      return err(`Invalid status transition: ${from} → ${to}`, 400, 'INVALID_TRANSITION')
    }
    updates.status = to

    // SMS/notification stub on status change
    console.log(`[NOTIFICATION] Reservation ${id} status changed ${from} → ${to} for ${existing.customerName} (${existing.customerPhone})`)
  }

  if (b.customerName !== undefined) updates.customerName = b.customerName
  if (b.customerPhone !== undefined) updates.customerPhone = b.customerPhone
  if (b.partySize !== undefined) {
    const ps = Number(b.partySize)
    if (!Number.isInteger(ps) || ps < 1) return err('partySize must be a positive integer', 400, 'INVALID_VALUE')
    updates.partySize = ps
  }
  if (b.notes !== undefined) updates.notes = b.notes
  if (b.tableId !== undefined) updates.tableId = b.tableId
  if (b.date !== undefined) updates.date = b.date
  if (b.time !== undefined) updates.time = b.time
  if (b.duration !== undefined) updates.duration = Number(b.duration)

  if (Object.keys(updates).length === 0) return err('Nothing to update', 400, 'VALIDATION_ERROR')

  updates.updatedAt = nowISO()

  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ')
  await exec(
    `UPDATE Reservation SET ${setClauses} WHERE id=? AND storeId=?`,
    [...Object.values(updates), id, storeId],
  )

  const updated = await queryOne(`SELECT * FROM Reservation WHERE id=?`, [id])
  return NextResponse.json(updated)
}
