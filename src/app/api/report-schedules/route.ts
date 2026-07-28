// GET /api/report-schedules?storeId=
// POST /api/report-schedules
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

async function ensureTables() {
  await exec(`
    CREATE TABLE IF NOT EXISTS ReportSchedule (
      id          TEXT PRIMARY KEY,
      storeId     TEXT NOT NULL,
      reportType  TEXT NOT NULL,
      frequency   TEXT NOT NULL,
      recipients  TEXT NOT NULL DEFAULT '[]',
      nextRunAt   TEXT,
      lastRunAt   TEXT,
      active      INTEGER NOT NULL DEFAULT 1,
      createdAt   TEXT NOT NULL,
      updatedAt   TEXT NOT NULL
    )
  `)
}

/** Calculate next run timestamp from frequency */
function calcNextRun(frequency: string, from: Date = new Date()): string {
  const d = new Date(from)
  switch (frequency) {
    case 'DAILY':
      d.setDate(d.getDate() + 1)
      d.setHours(8, 0, 0, 0)
      break
    case 'WEEKLY':
      // Next Monday at 08:00
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

function deserialize(row: any) {
  return {
    ...row,
    active: Boolean(row.active),
    recipients: typeof row.recipients === 'string' ? JSON.parse(row.recipients) : row.recipients,
  }
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureTables()

  const rows = await query(
    `SELECT * FROM ReportSchedule WHERE storeId=? ORDER BY createdAt DESC`,
    [storeId],
  )
  return NextResponse.json((rows as any[]).map(deserialize))
}

const VALID_REPORT_TYPES = ['SALES', 'INVENTORY', 'PAYROLL', 'PNL']
const VALID_FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY']

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureTables()

  const body = (await req.json()) as any

  const reportType = body.reportType
  const frequency = body.frequency

  if (!reportType || !VALID_REPORT_TYPES.includes(reportType))
    return err(`reportType must be one of: ${VALID_REPORT_TYPES.join(', ')}`, 400, 'VALIDATION_ERROR')

  if (!frequency || !VALID_FREQUENCIES.includes(frequency))
    return err(`frequency must be one of: ${VALID_FREQUENCIES.join(', ')}`, 400, 'VALIDATION_ERROR')

  const recipients = Array.isArray(body.recipients) ? body.recipients : []
  const now = nowISO()
  const id = newId()
  const nextRunAt = calcNextRun(frequency)

  await exec(
    `INSERT INTO ReportSchedule (id, storeId, reportType, frequency, recipients, nextRunAt, lastRunAt, active, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
    [
      id,
      storeId,
      reportType,
      frequency,
      JSON.stringify(recipients),
      nextRunAt,
      body.active !== false ? 1 : 0,
      now,
      now,
    ],
  )

  const row = await query(`SELECT * FROM ReportSchedule WHERE id=?`, [id])
  return NextResponse.json(deserialize((row as any[])[0]), { status: 201 })
}
