import { NextRequest, NextResponse } from 'next/server'
import { query, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function ensureGrievanceTables() {
  await exec(`CREATE TABLE IF NOT EXISTS Grievance (
    id          TEXT PRIMARY KEY,
    storeId     TEXT NOT NULL,
    employeeId  TEXT NOT NULL,
    type        TEXT NOT NULL DEFAULT 'GRIEVANCE',
    subject     TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status      TEXT NOT NULL DEFAULT 'OPEN',
    severity    TEXT NOT NULL DEFAULT 'LOW',
    reportedBy  TEXT NOT NULL,
    resolvedBy  TEXT,
    resolution  TEXT,
    resolvedAt  TEXT,
    createdAt   TEXT NOT NULL,
    updatedAt   TEXT NOT NULL
  )`)

  await exec(`CREATE TABLE IF NOT EXISTS GrievanceNote (
    id          TEXT PRIMARY KEY,
    grievanceId TEXT NOT NULL,
    storeId     TEXT NOT NULL,
    authorId    TEXT NOT NULL,
    note        TEXT NOT NULL,
    createdAt   TEXT NOT NULL
  )`)
}

export async function GET(req: NextRequest) {
  try {
    await ensureGrievanceTables()
    const { searchParams } = new URL(req.url)
    const storeId = searchParams.get('storeId')
    if (!storeId) return err('storeId required')

    const type = searchParams.get('type')
    const status = searchParams.get('status')
    const severity = searchParams.get('severity')
    const employeeId = searchParams.get('employeeId')

    let sql = `SELECT g.*, e.name as employeeName
      FROM Grievance g
      LEFT JOIN Employee e ON e.id = g.employeeId
      WHERE g.storeId = ?`
    const params: any[] = [storeId]

    if (type)       { sql += ' AND g.type = ?';       params.push(type) }
    if (status)     { sql += ' AND g.status = ?';     params.push(status) }
    if (severity)   { sql += ' AND g.severity = ?';   params.push(severity) }
    if (employeeId) { sql += ' AND g.employeeId = ?'; params.push(employeeId) }
    sql += ' ORDER BY g.createdAt DESC'

    const rows = await query(sql, params)
    return NextResponse.json({ data: rows })
  } catch (e: any) {
    return err(e.message, 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureGrievanceTables()
    const body = await req.json() as any
    const {
      storeId, employeeId, type = 'GRIEVANCE', subject, description = '',
      severity = 'LOW', reportedBy,
    } = body

    if (!storeId || !employeeId || !subject || !reportedBy) {
      return err('storeId, employeeId, subject, reportedBy required')
    }

    const VALID_TYPES = ['GRIEVANCE', 'DISCIPLINARY']
    if (!VALID_TYPES.includes(type)) return err(`type must be one of: ${VALID_TYPES.join(', ')}`)

    const VALID_SEV = ['LOW', 'MEDIUM', 'HIGH']
    if (!VALID_SEV.includes(severity)) return err(`severity must be one of: ${VALID_SEV.join(', ')}`)

    const id = newId()
    const now = nowISO()
    await exec(
      `INSERT INTO Grievance (id, storeId, employeeId, type, subject, description, status, severity, reportedBy, resolvedBy, resolution, resolvedAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, NULL, NULL, NULL, ?, ?)`,
      [id, storeId, employeeId, type, subject, description, severity, reportedBy, now, now],
    )
    return NextResponse.json({ id }, { status: 201 })
  } catch (e: any) {
    return err(e.message, 500)
  }
}
