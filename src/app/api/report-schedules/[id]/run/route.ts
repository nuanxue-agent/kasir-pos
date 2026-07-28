// POST /api/report-schedules/:id/run
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { queryOne, exec, nowISO } from '@/lib/db'
/** Calculate next run timestamp from frequency */
function calcNextRun(frequency: string, from: Date = new Date()): string {
  const d = new Date(from)
  switch (frequency) {
    case 'DAILY':
      d.setDate(d.getDate() + 1)
      d.setHours(8, 0, 0, 0)
      break
    case 'WEEKLY':
      d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7))
      d.setHours(8, 0, 0, 0)
      break
    case 'MONTHLY':
      d.setMonth(d.getMonth() + 1, 1)
      d.setHours(8, 0, 0, 0)
      break
    default:
      d.setDate(d.getDate() + 1)
  }
  return d.toISOString()
}

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  const { id } = await params

  const schedule = await queryOne<any>(
    `SELECT * FROM ReportSchedule WHERE id=? AND storeId=?`,
    [id, storeId],
  )
  if (!schedule) return err('Schedule not found', 404, 'NOT_FOUND')

  const now = nowISO()
  const nextRunAt = calcNextRun(schedule.frequency)

  // Update lastRunAt and nextRunAt
  await exec(
    `UPDATE ReportSchedule SET lastRunAt=?, nextRunAt=?, updatedAt=? WHERE id=? AND storeId=?`,
    [now, nextRunAt, now, id, storeId],
  )

  const recipients =
    typeof schedule.recipients === 'string'
      ? JSON.parse(schedule.recipients)
      : schedule.recipients

  // In a real system this would enqueue an email job; for now we record the run
  return NextResponse.json({
    ran: true,
    scheduleId: id,
    reportType: schedule.reportType,
    frequency: schedule.frequency,
    recipients,
    ranAt: now,
    nextRunAt,
  })
}
