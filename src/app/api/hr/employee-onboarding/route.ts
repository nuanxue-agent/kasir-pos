import { NextRequest, NextResponse } from 'next/server'
import { query, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

async function ensureTables() {
  await exec(`CREATE TABLE IF NOT EXISTS OnboardingTemplate (
    id          TEXT PRIMARY KEY,
    storeId     TEXT NOT NULL,
    name        TEXT NOT NULL,
    type        TEXT NOT NULL DEFAULT 'ONBOARDING',
    tasks       TEXT NOT NULL DEFAULT '[]',
    createdAt   TEXT NOT NULL,
    updatedAt   TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS EmployeeOnboarding (
    id          TEXT PRIMARY KEY,
    employeeId  TEXT NOT NULL,
    storeId     TEXT NOT NULL,
    templateId  TEXT,
    status      TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    startDate   TEXT NOT NULL,
    tasks       TEXT NOT NULL DEFAULT '[]',
    createdAt   TEXT NOT NULL,
    updatedAt   TEXT NOT NULL
  )`)
}

export async function GET(req: NextRequest) {
  try {
    await ensureTables()
    const { searchParams } = new URL(req.url)
    const storeId = searchParams.get('storeId')
    const employeeId = searchParams.get('employeeId')
    const status = searchParams.get('status')
    if (!storeId) return err('storeId required')

    let sql = `SELECT eo.*, e.name as employeeName
      FROM EmployeeOnboarding eo
      LEFT JOIN Employee e ON e.id = eo.employeeId
      WHERE eo.storeId = ?`
    const params: any[] = [storeId]
    if (employeeId) { sql += ' AND eo.employeeId = ?'; params.push(employeeId) }
    if (status) { sql += ' AND eo.status = ?'; params.push(status) }
    sql += ' ORDER BY eo.createdAt DESC'

    const rows = await query(sql, params)
    const data = (rows as any[]).map(r => ({
      ...r,
      tasks: JSON.parse(r.tasks || '[]'),
    }))
    return NextResponse.json({ data })
  } catch (e: any) {
    return err(e.message, 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureTables()
    const body = await req.json() as any
    const { storeId, employeeId, templateId, startDate, tasks = [] } = body
    if (!storeId) return err('storeId required')
    if (!employeeId) return err('employeeId required')

    // If a template is provided, seed tasks from it
    let resolvedTasks = tasks
    if (templateId && tasks.length === 0) {
      const tmplRows = await query(`SELECT tasks FROM OnboardingTemplate WHERE id = ?`, [templateId])
      if (tmplRows.length > 0) {
        const tmplTasks = JSON.parse((tmplRows[0] as any).tasks || '[]')
        resolvedTasks = tmplTasks.map((t: any) => ({
          name: t.name,
          description: t.description ?? '',
          dueInDays: t.dueInDays ?? 0,
          completed: false,
          completedAt: null,
        }))
      }
    }

    const id = newId()
    const now = nowISO()
    const start = startDate ?? now
    await exec(
      `INSERT INTO EmployeeOnboarding (id, employeeId, storeId, templateId, status, startDate, tasks, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, 'IN_PROGRESS', ?, ?, ?, ?)`,
      [id, employeeId, storeId, templateId ?? null, start, JSON.stringify(resolvedTasks), now, now],
    )
    return NextResponse.json({ id }, { status: 201 })
  } catch (e: any) {
    return err(e.message, 500)
  }
}
