// PATCH /api/report-schedules/:id
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { queryOne, exec, nowISO } from '@/lib/db'
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

function deserialize(row: any) {
  return {
    ...row,
    active: Boolean(row.active),
    recipients: typeof row.recipients === 'string' ? JSON.parse(row.recipients) : row.recipients,
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  const { id } = await params

  const existing = await queryOne(
    `SELECT * FROM ReportSchedule WHERE id=? AND storeId=?`,
    [id, storeId],
  )
  if (!existing) return err('Schedule not found', 404, 'NOT_FOUND')

  const body = (await req.json()) as any
  const updates: Record<string, any> = { updatedAt: nowISO() }

  if (body.reportType !== undefined) updates.reportType = body.reportType
  if (body.frequency !== undefined) {
    updates.frequency = body.frequency
    updates.nextRunAt = calcNextRun(body.frequency)
  }
  if (body.recipients !== undefined) updates.recipients = JSON.stringify(body.recipients)
  if (body.active !== undefined) updates.active = body.active ? 1 : 0
  if (body.nextRunAt !== undefined) updates.nextRunAt = body.nextRunAt

  const setClauses = Object.keys(updates)
    .map(k => `${k} = ?`)
    .join(', ')
  const values = Object.values(updates)

  await exec(`UPDATE ReportSchedule SET ${setClauses} WHERE id=? AND storeId=?`, [
    ...values,
    id,
    storeId,
  ])

  const row = await queryOne(`SELECT * FROM ReportSchedule WHERE id=?`, [id])
  return NextResponse.json(deserialize(row))
}
