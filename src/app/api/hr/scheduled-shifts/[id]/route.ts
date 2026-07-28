import { NextRequest, NextResponse } from 'next/server'
import { exec, nowISO } from '@/lib/db'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json() as {
      startTime?: string; endTime?: string; role?: string
      notes?: string; status?: string; employeeId?: string; date?: string
    }
    const fields: string[] = []
    const values: any[] = []

    if (body.employeeId !== undefined) { fields.push('employeeId = ?'); values.push(body.employeeId) }
    if (body.date !== undefined) { fields.push('date = ?'); values.push(body.date) }
    if (body.startTime !== undefined) { fields.push('startTime = ?'); values.push(body.startTime) }
    if (body.endTime !== undefined) { fields.push('endTime = ?'); values.push(body.endTime) }
    if (body.role !== undefined) { fields.push('role = ?'); values.push(body.role) }
    if (body.notes !== undefined) { fields.push('notes = ?'); values.push(body.notes) }
    if (body.status !== undefined) { fields.push('status = ?'); values.push(body.status) }

    if (fields.length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 })

    fields.push('updatedAt = ?')
    values.push(nowISO())
    values.push(id)

    await exec(`UPDATE ScheduledShift SET ${fields.join(', ')} WHERE id = ?`, values)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await exec(`UPDATE ScheduledShift SET status = 'CANCELLED', updatedAt = ? WHERE id = ?`, [nowISO(), id])
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
