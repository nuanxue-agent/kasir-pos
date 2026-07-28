import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function ensureBPJSTables() {
  await exec(`CREATE TABLE IF NOT EXISTS BPJSEnrollment (
    id            TEXT PRIMARY KEY,
    storeId       TEXT NOT NULL,
    employeeId    TEXT NOT NULL,
    type          TEXT NOT NULL DEFAULT 'KESEHATAN',
    memberNumber  TEXT,
    class         INTEGER,
    status        TEXT NOT NULL DEFAULT 'PENDING',
    enrolledAt    TEXT NOT NULL,
    terminatedAt  TEXT,
    createdAt     TEXT NOT NULL,
    updatedAt     TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS BPJSContribution (
    id                   TEXT PRIMARY KEY,
    enrollmentId         TEXT NOT NULL,
    storeId              TEXT NOT NULL,
    period               TEXT NOT NULL,
    employeeContribution REAL NOT NULL DEFAULT 0,
    employerContribution REAL NOT NULL DEFAULT 0,
    totalContribution    REAL NOT NULL DEFAULT 0,
    status               TEXT NOT NULL DEFAULT 'PENDING',
    dueDate              TEXT NOT NULL,
    paidAt               TEXT,
    createdAt            TEXT NOT NULL,
    updatedAt            TEXT NOT NULL
  )`)
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const sp = req.nextUrl.searchParams
    const storeId = sp.get('storeId') ?? user.stores?.[0]?.id
    if (!storeId) return err('storeId required')

    await ensureBPJSTables()

    const status = sp.get('status')
    const type = sp.get('type')
    const employeeId = sp.get('employeeId')

    let sql = `SELECT e.*, emp.name as employeeName
      FROM BPJSEnrollment e
      LEFT JOIN Employee emp ON emp.id = e.employeeId
      WHERE e.storeId = ?`
    const params: any[] = [storeId]

    if (status) { sql += ' AND e.status = ?'; params.push(status) }
    if (type) { sql += ' AND e.type = ?'; params.push(type) }
    if (employeeId) { sql += ' AND e.employeeId = ?'; params.push(employeeId) }

    sql += ' ORDER BY e.enrolledAt DESC'

    const rows = await query(sql, params)
    return NextResponse.json({ data: rows })
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const sp = req.nextUrl.searchParams
    const storeId = sp.get('storeId') ?? user.stores?.[0]?.id
    if (!storeId) return err('storeId required')

    await ensureBPJSTables()

    const b = (await req.json()) as any
    if (!b.employeeId) return err('employeeId required')
    if (!b.type || !['KESEHATAN', 'KETENAGAKERJAAN'].includes(b.type)) {
      return err('type must be KESEHATAN or KETENAGAKERJAAN')
    }

    const bpjsClass = b.type === 'KESEHATAN' ? (Number(b.class) || 1) : null
    if (b.type === 'KESEHATAN' && bpjsClass && ![1, 2, 3].includes(bpjsClass)) {
      return err('class must be 1, 2, or 3 for KESEHATAN')
    }

    const t = nowISO()
    const id = newId()
    await exec(
      `INSERT INTO BPJSEnrollment
        (id, storeId, employeeId, type, memberNumber, class, status, enrolledAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)`,
      [id, storeId, b.employeeId, b.type, b.memberNumber ?? null, bpjsClass, b.enrolledAt ?? t, t, t],
    )

    return NextResponse.json({ id }, { status: 201 })
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500)
  }
}
