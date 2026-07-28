import { NextRequest, NextResponse } from 'next/server'
import { query, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function ensureIncidentTable() {
  await exec(`CREATE TABLE IF NOT EXISTS Incident (
    id                TEXT PRIMARY KEY,
    storeId           TEXT NOT NULL,
    reportedBy        TEXT NOT NULL,
    involvedEmployees TEXT NOT NULL DEFAULT '[]',
    type              TEXT NOT NULL DEFAULT 'OTHER',
    description       TEXT NOT NULL DEFAULT '',
    severity          TEXT NOT NULL DEFAULT 'LOW',
    status            TEXT NOT NULL DEFAULT 'OPEN',
    createdAt         TEXT NOT NULL,
    updatedAt         TEXT NOT NULL
  )`)
}

export async function GET(req: NextRequest) {
  try {
    await ensureIncidentTable()
    const { searchParams } = new URL(req.url)
    const storeId = searchParams.get('storeId')
    const severity = searchParams.get('severity')
    const status = searchParams.get('status')
    const type = searchParams.get('type')
    if (!storeId) return err('storeId required')

    let sql = `SELECT * FROM Incident WHERE storeId = ?`
    const params: any[] = [storeId]

    if (severity) { sql += ' AND severity = ?'; params.push(severity) }
    if (status) { sql += ' AND status = ?'; params.push(status) }
    if (type) { sql += ' AND type = ?'; params.push(type) }
    sql += ' ORDER BY createdAt DESC'

    const rows = await query(sql, params)
    const data = (rows as any[]).map(r => ({
      ...r,
      involvedEmployees: JSON.parse(r.involvedEmployees || '[]'),
    }))
    return NextResponse.json({ data })
  } catch (e: any) {
    return err(e.message, 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureIncidentTable()
    const body = await req.json() as any
    const {
      storeId,
      reportedBy,
      involvedEmployees = [],
      type = 'OTHER',
      description = '',
      severity = 'LOW',
    } = body

    if (!storeId || !reportedBy) {
      return err('storeId, reportedBy required')
    }

    const VALID_TYPES = ['MISCONDUCT', 'SAFETY', 'POLICY_VIOLATION', 'OTHER']
    const VALID_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH']
    if (!VALID_TYPES.includes(type)) return err(`type must be one of: ${VALID_TYPES.join(', ')}`)
    if (!VALID_SEVERITIES.includes(severity)) return err(`severity must be one of: ${VALID_SEVERITIES.join(', ')}`)

    const id = newId()
    const now = nowISO()
    await exec(
      `INSERT INTO Incident (id, storeId, reportedBy, involvedEmployees, type, description, severity, status, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?)`,
      [id, storeId, reportedBy, JSON.stringify(involvedEmployees), type, description, severity, now, now],
    )
    return NextResponse.json({ id }, { status: 201 })
  } catch (e: any) {
    return err(e.message, 500)
  }
}
