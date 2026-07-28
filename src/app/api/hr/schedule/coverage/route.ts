import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

const ROLE_MINIMUMS: Record<string, number> = {
  CASHIER: 1,
  WAITER: 2,
  KITCHEN: 1,
  MANAGER: 1,
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const storeId = searchParams.get('storeId')
    const week = searchParams.get('week')
    if (!storeId || !week) return NextResponse.json({ error: 'storeId and week required' }, { status: 400 })

    const end = new Date(new Date(week).getTime() + 6 * 86400000).toISOString().slice(0, 10)
    const shifts = await query(
      `SELECT date, role, COUNT(*) as scheduled FROM Shift
       WHERE storeId = ? AND date >= ? AND date <= ? AND status IN ('SCHEDULED','CONFIRMED')
       GROUP BY date, role`,
      [storeId, week, end]
    )

    const alerts: Array<{ date: string; role: string; scheduled: number; required: number }> = []
    const dates: string[] = []
    for (let i = 0; i < 7; i++) {
      dates.push(new Date(new Date(week).getTime() + i * 86400000).toISOString().slice(0, 10))
    }
    for (const date of dates) {
      for (const [role, required] of Object.entries(ROLE_MINIMUMS)) {
        const found = shifts.find((s: any) => s.date === date && s.role === role)
        const scheduled = found ? Number(found.scheduled) : 0
        if (scheduled < required) {
          alerts.push({ date, role, scheduled, required })
        }
      }
    }
    return NextResponse.json(alerts)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
