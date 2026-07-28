import { NextRequest, NextResponse } from 'next/server'
import { query, exec, nowISO } from '@/lib/db'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

async function ensureTable() {
  await exec(`CREATE TABLE IF NOT EXISTS EmployeeOffboarding (
    id              TEXT PRIMARY KEY,
    employeeId      TEXT NOT NULL,
    storeId         TEXT NOT NULL,
    templateId      TEXT,
    status          TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    lastWorkingDate TEXT,
    reason          TEXT,
    tasks           TEXT NOT NULL DEFAULT '[]',
    createdAt       TEXT NOT NULL,
    updatedAt       TEXT NOT NULL
  )`)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await ensureTable()
    const { id } = await params
    const body = await req.json() as any

    const rows = await query(`SELECT * FROM EmployeeOffboarding WHERE id = ?`, [id])
    if (rows.length === 0) return err('Offboarding record not found', 404)
    const record = rows[0] as any

    const sets: string[] = []
    const vals: any[] = []

    if (body.tasks !== undefined) {
      sets.push('tasks = ?')
      vals.push(JSON.stringify(body.tasks))

      // Auto-complete if all tasks done
      const allDone =
        Array.isArray(body.tasks) &&
        body.tasks.length > 0 &&
        body.tasks.every((t: any) => t.completed)
      if (allDone && record.status !== 'COMPLETED') {
        sets.push('status = ?')
        vals.push('COMPLETED')
      }
    }

    if (body.status !== undefined) {
      if (!['IN_PROGRESS', 'COMPLETED'].includes(body.status)) return err('Invalid status')
      sets.push('status = ?')
      vals.push(body.status)
    }

    if (body.lastWorkingDate !== undefined) {
      sets.push('lastWorkingDate = ?')
      vals.push(body.lastWorkingDate)
    }

    if (body.reason !== undefined) {
      sets.push('reason = ?')
      vals.push(body.reason)
    }

    if (sets.length === 0) return err('No fields to update')
    sets.push('updatedAt = ?')
    vals.push(nowISO())
    vals.push(id)

    await exec(`UPDATE EmployeeOffboarding SET ${sets.join(', ')} WHERE id = ?`, vals)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return err(e.message, 500)
  }
}
