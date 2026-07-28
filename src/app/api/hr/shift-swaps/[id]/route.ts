import { NextRequest, NextResponse } from 'next/server'
import { exec, nowISO } from '@/lib/db'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { status } = await req.json() as { status: string }
    if (!['APPROVED', 'REJECTED'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }
    await exec(
      `UPDATE ShiftSwap SET status = ?, updatedAt = ? WHERE id = ?`,
      [status, nowISO(), params.id]
    )
    // If approved, swap the employeeIds on the shift
    if (status === 'APPROVED') {
      const rows = await (await import('@/lib/db')).query(
        'SELECT requesterId, targetId, shiftId FROM ShiftSwap WHERE id = ?',
        [params.id]
      )
      if (rows[0]) {
        const { targetId, shiftId } = rows[0]
        await exec(
          `UPDATE Shift SET employeeId = ?, updatedAt = ? WHERE id = ?`,
          [targetId, nowISO(), shiftId]
        )
      }
    }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
