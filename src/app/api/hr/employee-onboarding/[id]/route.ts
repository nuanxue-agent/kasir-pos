import { NextRequest, NextResponse } from 'next/server'
import { query, exec, nowISO } from '@/lib/db'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

async function ensureTable() {
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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await ensureTable()
    const { id } = await params
    const body = await req.json() as any

    const rows = await query(`SELECT * FROM EmployeeOnboarding WHERE id = ?`, [id])
    if (rows.length === 0) return err('Onboarding record not found', 404)
    const record = rows[0] as any
    const currentTasks: any[] = JSON.parse(record.tasks || '[]')

    const sets: string[] = []
    const vals: any[] = []

    // Update individual task completion
    if (body.taskIndex !== undefined && typeof body.taskIndex === 'number') {
      const idx = body.taskIndex
      if (idx < 0 || idx >= currentTasks.length) return err('Invalid taskIndex')
      currentTasks[idx] = {
        ...currentTasks[idx],
        completed: body.completed ?? true,
        completedAt: body.completed === false ? null : (nowISO()),
      }
      sets.push('tasks = ?')
      vals.push(JSON.stringify(currentTasks))
    }

    // Replace full tasks array
    if (body.tasks !== undefined) {
      sets.push('tasks = ?')
      vals.push(JSON.stringify(body.tasks))
    }

    // Update status
    if (body.status !== undefined) {
      if (!['IN_PROGRESS', 'COMPLETED'].includes(body.status)) return err('Invalid status')
      sets.push('status = ?')
      vals.push(body.status)
    }

    // Auto-complete if all tasks done
    if (body.taskIndex !== undefined) {
      const updatedTasks: any[] = body.tasks ?? currentTasks
      const allDone = updatedTasks.length > 0 && updatedTasks.every((t: any) => t.completed)
      if (allDone && record.status !== 'COMPLETED') {
        sets.push('status = ?')
        vals.push('COMPLETED')
      }
    }

    if (sets.length === 0) return err('No fields to update')
    sets.push('updatedAt = ?')
    vals.push(nowISO())
    vals.push(id)

    await exec(`UPDATE EmployeeOnboarding SET ${sets.join(', ')} WHERE id = ?`, vals)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return err(e.message, 500)
  }
}
