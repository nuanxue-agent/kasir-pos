import { NextRequest, NextResponse } from 'next/server'
import { exec, nowISO } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const { storeId, week } = await req.json() as { storeId?: string; week?: string }
    if (!storeId || !week) return NextResponse.json({ error: 'storeId and week required' }, { status: 400 })
    const end = new Date(new Date(week).getTime() + 6 * 86400000).toISOString().slice(0, 10)
    await exec(
      `UPDATE Shift SET status = 'CONFIRMED', updatedAt = ? WHERE storeId = ? AND date >= ? AND date <= ? AND status = 'SCHEDULED'`,
      [nowISO(), storeId, week, end]
    )
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
