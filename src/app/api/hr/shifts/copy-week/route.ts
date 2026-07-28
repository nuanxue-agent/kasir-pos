import { NextRequest, NextResponse } from 'next/server'
import { query, exec, newId, nowISO } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const { storeId, fromWeek, toWeek } = await req.json() as { storeId?: string; fromWeek?: string; toWeek?: string }
    if (!storeId || !fromWeek || !toWeek) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    const fromEnd = new Date(new Date(fromWeek).getTime() + 6 * 86400000).toISOString().slice(0, 10)
    const shifts = await query(
      `SELECT * FROM Shift WHERE storeId = ? AND date >= ? AND date <= ?`,
      [storeId, fromWeek, fromEnd]
    )
    const fromStart = new Date(fromWeek)
    const toStart = new Date(toWeek)
    const diffDays = Math.round((toStart.getTime() - fromStart.getTime()) / 86400000)
    const now = nowISO()
    for (const s of shifts) {
      const newDate = new Date(new Date(s.date).getTime() + diffDays * 86400000).toISOString().slice(0, 10)
      const id = newId()
      await exec(
        `INSERT OR IGNORE INTO Shift (id, storeId, employeeId, date, startTime, endTime, role, notes, status, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'SCHEDULED', ?, ?)`,
        [id, storeId, s.employeeId, newDate, s.startTime, s.endTime, s.role, s.notes ?? '', now, now]
      )
    }
    return NextResponse.json({ copied: shifts.length })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
