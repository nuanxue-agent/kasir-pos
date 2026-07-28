import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, nowISO } from '@/lib/db'
import { ensureShiftScheduleTables } from '../../shift-schedules/route'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)

  const { id } = await params
  await ensureShiftScheduleTables()

  const b = (await req.json()) as any
  const { status } = b

  if (!status || !['APPROVED', 'REJECTED'].includes(status)) {
    return err('status must be APPROVED or REJECTED')
  }

  // Load swap request
  const rows = (await query(
    `SELECT * FROM ShiftSwapRequest WHERE id = ?`,
    [id],
  )) as any[]

  if (rows.length === 0) return err('Swap request not found', 404)

  const swap = rows[0]
  if (swap.status !== 'PENDING') {
    return err(`Cannot update a swap request with status ${swap.status}`)
  }

  const t = nowISO()

  await exec(
    `UPDATE ShiftSwapRequest SET status = ?, updatedAt = ? WHERE id = ?`,
    [status, t, id],
  )

  // If approved: update the schedule entry to SWAPPED and reassign to target
  if (status === 'APPROVED') {
    await exec(
      `UPDATE ShiftSchedule SET employeeId = ?, status = 'SWAPPED', updatedAt = ? WHERE id = ?`,
      [swap.targetId, t, swap.scheduleId],
    )
  }

  return NextResponse.json({ ok: true })
}
