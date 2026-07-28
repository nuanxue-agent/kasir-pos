// GET /api/reservations/availability?date=&partySize=&storeId=
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  const date = req.nextUrl.searchParams.get('date')
  const partySizeParam = req.nextUrl.searchParams.get('partySize')

  if (!date) return err('date is required (YYYY-MM-DD)', 400, 'MISSING_FIELD')
  if (!partySizeParam) return err('partySize is required', 400, 'MISSING_FIELD')

  const partySize = Number(partySizeParam)
  if (!Number.isInteger(partySize) || partySize < 1) {
    return err('partySize must be a positive integer', 400, 'INVALID_VALUE')
  }

  // Fetch all tables for the store
  const tables = await query<any>(
    `SELECT id, number, capacity FROM \`Table\` WHERE storeId=? ORDER BY number`,
    [storeId],
  ).catch(() =>
    // Fallback: Table table may use different schema or not exist yet
    query<any>(`SELECT id, number, capacity FROM RestaurantTable WHERE storeId=? ORDER BY number`, [storeId])
      .catch(() => [] as any[]),
  )

  // Fetch reservations for this date (active ones)
  const reservations = await query<any>(
    `SELECT tableId, time, duration FROM Reservation
     WHERE storeId=? AND date=? AND status NOT IN ('CANCELLED','NO_SHOW')`,
    [storeId, date],
  ).catch(() => [] as any[])

  // Build a map of tableId → booked slots
  const bookedSlots: Record<string, Array<{ startMs: number; endMs: number }>> = {}
  for (const r of reservations) {
    if (!bookedSlots[r.tableId]) bookedSlots[r.tableId] = []
    const startMs = new Date(`${date}T${r.time}`).getTime()
    bookedSlots[r.tableId].push({ startMs, endMs: startMs + r.duration * 60_000 })
  }

  // Generate available time slots (every 30 min from 07:00 to 22:00)
  const slots: string[] = []
  for (let h = 7; h < 22; h++) {
    for (const m of [0, 30]) {
      slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
    }
  }

  const availableTables = tables
    .filter((t: any) => {
      const cap = Number(t.capacity ?? 99)
      return cap >= partySize
    })
    .map((t: any) => {
      const booked = bookedSlots[t.id] ?? []
      const availableSlots = slots.filter(slot => {
        const slotStart = new Date(`${date}T${slot}`).getTime()
        const slotEnd = slotStart + 90 * 60_000 // assume 90-min default
        return !booked.some(b => slotStart < b.endMs && slotEnd > b.startMs)
      })
      return {
        tableId: t.id,
        tableNumber: t.number,
        capacity: t.capacity ?? null,
        availableSlots,
      }
    })

  return NextResponse.json({ date, partySize, tables: availableTables })
}
