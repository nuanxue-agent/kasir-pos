import { NextRequest, NextResponse } from 'next/server'
import { exec, queryOne, nowISO } from '@/lib/db'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json() as { startTime?: string; endTime?: string; role?: string; notes?: string; status?: string; employeeId?: string; date?: string }
    const { startTime, endTime, role, notes, status, employeeId, date } = body
    const sets: string[] = []
    const vals: any[] = []
    if (startTime !== undefined) { sets.push('startTime = ?'); vals.push(startTime) }
    if (endTime !== undefined) { sets.push('endTime = ?'); vals.push(endTime) }
    if (role !== undefined) { sets.push('role = ?'); vals.push(role) }
    if (notes !== undefined) { sets.push('notes = ?'); vals.push(notes) }
    if (status !== undefined) { sets.push('status = ?'); vals.push(status) }
    if (employeeId !== undefined) { sets.push('employeeId = ?'); vals.push(employeeId) }
    if (date !== undefined) { sets.push('date = ?'); vals.push(date) }
    if (sets.length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    sets.push('updatedAt = ?')
    vals.push(nowISO())
    vals.push(params.id)
    await exec(`UPDATE Shift SET ${sets.join(', ')} WHERE id = ?`, vals)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await exec('DELETE FROM Shift WHERE id = ?', [params.id])
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
