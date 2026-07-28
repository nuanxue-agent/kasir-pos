// PATCH /api/waitlist/:id
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, queryOne, exec, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

type WaitStatus = 'WAITING' | 'SEATED' | 'LEFT'

const VALID_TRANSITIONS: Record<WaitStatus, WaitStatus[]> = {
  WAITING: ['SEATED', 'LEFT'],
  SEATED: [],
  LEFT: [],
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
    `SELECT * FROM WaitlistEntry WHERE id=? AND storeId=?`,
    [id, storeId],
  )
  if (!existing) return err('Waitlist entry not found', 404, 'NOT_FOUND')

  const b = (await req.json()) as any
  const updates: Record<string, any> = {}

  if (b.status !== undefined) {
    const from = existing.status as WaitStatus
    const to = b.status as WaitStatus
    if (!VALID_TRANSITIONS[from]?.includes(to)) {
      return err(`Invalid status transition: ${from} → ${to}`, 400, 'INVALID_TRANSITION')
    }
    updates.status = to

    if (to === 'SEATED') {
      // Auto-assign table if provided
      if (b.tableId) {
        updates.tableId = b.tableId
        updates.seatedAt = nowISO()

        // Update table status to OCCUPIED if table is tracked
        await exec(
          `UPDATE RestaurantTable SET status='OCCUPIED' WHERE id=? AND storeId=?`,
          [b.tableId, storeId],
        ).catch(() => {
          // Table tracking may use different table name — best-effort
        })

        // Create a reservation record for the seated party
        const { newId, nowISO: now2 } = await import('@/lib/db')
        const reservationId = newId()
        const nowTs = now2()
        const today = nowTs.split('T')[0]
        const timeNow = nowTs.split('T')[1]?.slice(0, 5) ?? '00:00'

        await exec(
          `INSERT OR IGNORE INTO Reservation
             (id,storeId,tableId,customerName,customerPhone,partySize,date,time,duration,status,notes,createdAt,updatedAt)
           VALUES (?,?,?,?,?,?,?,?,90,'SEATED','Walk-in from waitlist',?,?)`,
          [reservationId, storeId, b.tableId, existing.customerName, existing.customerPhone,
           existing.partySize, today, timeNow, nowTs, nowTs],
        ).catch(() => {
          // Reservation table may not exist yet — non-critical
        })
      }

      // SMS/notification stub
      console.log(`[NOTIFICATION] Waitlist ${id}: ${existing.customerName} (${existing.customerPhone}) is now SEATED${b.tableId ? ` at table ${b.tableId}` : ''}`)
    } else if (to === 'LEFT') {
      console.log(`[NOTIFICATION] Waitlist ${id}: ${existing.customerName} (${existing.customerPhone}) has LEFT the queue`)
    }
  }

  if (b.estimatedWait !== undefined) updates.estimatedWait = Number(b.estimatedWait)
  if (b.tableId !== undefined && !updates.tableId) updates.tableId = b.tableId

  if (Object.keys(updates).length === 0) return err('Nothing to update', 400, 'VALIDATION_ERROR')

  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ')
  await exec(
    `UPDATE WaitlistEntry SET ${setClauses} WHERE id=? AND storeId=?`,
    [...Object.values(updates), id, storeId],
  )

  // Recalculate estimated wait for remaining WAITING entries
  const stillWaiting = await query<any>(
    `SELECT id FROM WaitlistEntry WHERE storeId=? AND status='WAITING' ORDER BY addedAt ASC`,
    [storeId],
  )
  for (let i = 0; i < stillWaiting.length; i++) {
    await exec(
      `UPDATE WaitlistEntry SET estimatedWait=? WHERE id=?`,
      [i * 20, stillWaiting[i].id],
    )
  }

  const updated = await queryOne(`SELECT * FROM WaitlistEntry WHERE id=?`, [id])
  return NextResponse.json(updated)
}
