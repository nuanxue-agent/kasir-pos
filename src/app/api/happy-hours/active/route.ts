import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'
import { ensureTables } from '../route'

function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status })
}
function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

function parseRow(r: any) {
  return {
    ...r,
    days: typeof r.days === 'string' ? JSON.parse(r.days) : r.days,
    targetIds: typeof r.targetIds === 'string' ? JSON.parse(r.targetIds) : r.targetIds,
    active: Boolean(r.active),
  }
}

function isCurrentlyActive(
  hh: { days: number[]; startTime: string; endTime: string },
  now: Date,
): boolean {
  const currentDay = now.getDay()
  if (!hh.days.includes(currentDay)) return false
  const hhmm = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
  return hhmm >= hh.startTime && hhmm < hh.endTime
}

// GET /api/happy-hours/active?storeId=
// Returns all happy hours that are currently active (day + time match, active=1)
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const url = new URL(req.url)
    const storeId = url.searchParams.get('storeId') ?? user.stores?.[0]?.id
    if (!storeId) return err('storeId required')

    await ensureTables()

    // Fetch all active happy hours for the store
    const rows = await query('SELECT * FROM HappyHour WHERE storeId = ? AND active = 1', [storeId])

    const now = new Date()
    const parsed = (rows as any[]).map(parseRow)
    const active = parsed.filter(hh => isCurrentlyActive(hh, now))

    return ok(active)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
