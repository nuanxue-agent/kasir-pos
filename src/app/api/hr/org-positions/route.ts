import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function ensureOrgPositionTable() {
  await exec(`CREATE TABLE IF NOT EXISTS OrgPosition (
    id          TEXT PRIMARY KEY,
    storeId     TEXT NOT NULL,
    employeeId  TEXT,
    managerId   TEXT,
    title       TEXT NOT NULL,
    department  TEXT NOT NULL DEFAULT '',
    level       INTEGER NOT NULL DEFAULT 0,
    active      INTEGER NOT NULL DEFAULT 1,
    createdAt   TEXT NOT NULL,
    updatedAt   TEXT NOT NULL
  )`)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureOrgPositionTable()

  const rows = await query(
    `SELECT op.*,
            e.name  AS employeeName,
            e.role  AS employeeRole,
            e.baseSalary AS salary,
            m.name  AS managerName
     FROM OrgPosition op
     LEFT JOIN Employee e ON op.employeeId = e.id
     LEFT JOIN Employee m ON (
       SELECT employeeId FROM OrgPosition WHERE id = op.managerId AND storeId = op.storeId LIMIT 1
     ) = m.id
     WHERE op.storeId = ? AND op.active = 1
     ORDER BY op.level ASC, op.department ASC, op.title ASC`,
    [storeId],
  )

  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureOrgPositionTable()

  const b = (await req.json()) as any
  if (!b.title) return err("Field 'title' is required", 400, 'MISSING_FIELD')

  // Validate managerId exists in same store if provided
  if (b.managerId) {
    const mgr = await query(
      `SELECT id FROM OrgPosition WHERE id = ? AND storeId = ?`,
      [b.managerId, storeId],
    )
    if ((mgr as any[]).length === 0) return err('managerId not found in this store', 400, 'INVALID_REF')
  }

  const id = newId()
  const t = nowISO()
  const level = Number(b.level ?? 0)

  await exec(
    `INSERT INTO OrgPosition (id, storeId, employeeId, managerId, title, department, level, active, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    [id, storeId, b.employeeId ?? null, b.managerId ?? null, b.title, b.department ?? '', level, t, t],
  )

  return NextResponse.json({ id }, { status: 201 })
}
