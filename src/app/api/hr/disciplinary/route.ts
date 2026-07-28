import { NextRequest, NextResponse } from 'next/server'
import { query, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function ensureDisciplinaryTable() {
  await exec(`CREATE TABLE IF NOT EXISTS DisciplinaryAction (
    id            TEXT PRIMARY KEY,
    storeId       TEXT NOT NULL,
    employeeId    TEXT NOT NULL,
    type          TEXT NOT NULL DEFAULT 'VERBAL_WARNING',
    reason        TEXT NOT NULL,
    description   TEXT NOT NULL DEFAULT '',
    date          TEXT NOT NULL,
    issuedBy      TEXT NOT NULL,
    acknowledged  INTEGER NOT NULL DEFAULT 0,
    acknowledgedAt TEXT,
    createdAt     TEXT NOT NULL,
    updatedAt     TEXT NOT NULL
  )`)
}

export async function GET(req: NextRequest) {
  try {
    await ensureDisciplinaryTable()
    const { searchParams } = new URL(req.url)
    const storeId = searchParams.get('storeId')
    const employeeId = searchParams.get('employeeId')
    const type = searchParams.get('type')
    if (!storeId) return err('storeId required')

    let sql = `SELECT da.*, e.name as employeeName
      FROM DisciplinaryAction da
      LEFT JOIN Employee e ON e.id = da.employeeId
      WHERE da.storeId = ?`
    const params: any[] = [storeId]

    if (employeeId) { sql += ' AND da.employeeId = ?'; params.push(employeeId) }
    if (type) { sql += ' AND da.type = ?'; params.push(type) }
    sql += ' ORDER BY da.date DESC, da.createdAt DESC'

    const rows = await query(sql, params)
    const data = (rows as any[]).map(r => ({
      ...r,
      acknowledged: Boolean(r.acknowledged),
    }))
    return NextResponse.json({ data })
  } catch (e: any) {
    return err(e.message, 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureDisciplinaryTable()
    const body = await req.json() as any
    const { storeId, employeeId, type = 'VERBAL_WARNING', reason, description = '', date, issuedBy } = body

    if (!storeId || !employeeId || !reason || !date || !issuedBy) {
      return err('storeId, employeeId, reason, date, issuedBy required')
    }

    const VALID_TYPES = ['VERBAL_WARNING', 'WRITTEN_WARNING', 'SUSPENSION', 'TERMINATION']
    if (!VALID_TYPES.includes(type)) {
      return err(`type must be one of: ${VALID_TYPES.join(', ')}`)
    }

    const id = newId()
    const now = nowISO()
    await exec(
      `INSERT INTO DisciplinaryAction (id, storeId, employeeId, type, reason, description, date, issuedBy, acknowledged, acknowledgedAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?)`,
      [id, storeId, employeeId, type, reason, description, date, issuedBy, now, now],
    )
    return NextResponse.json({ id }, { status: 201 })
  } catch (e: any) {
    return err(e.message, 500)
  }
}
