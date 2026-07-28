import { NextRequest, NextResponse } from 'next/server'
import { query, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

async function ensureTable() {
  await exec(`CREATE TABLE IF NOT EXISTS OnboardingTemplate (
    id          TEXT PRIMARY KEY,
    storeId     TEXT NOT NULL,
    name        TEXT NOT NULL,
    type        TEXT NOT NULL DEFAULT 'ONBOARDING',
    tasks       TEXT NOT NULL DEFAULT '[]',
    createdAt   TEXT NOT NULL,
    updatedAt   TEXT NOT NULL
  )`)
}

export async function GET(req: NextRequest) {
  try {
    await ensureTable()
    const { searchParams } = new URL(req.url)
    const storeId = searchParams.get('storeId')
    const type = searchParams.get('type')
    if (!storeId) return err('storeId required')

    let sql = `SELECT * FROM OnboardingTemplate WHERE storeId = ?`
    const params: any[] = [storeId]
    if (type) { sql += ' AND type = ?'; params.push(type) }
    sql += ' ORDER BY createdAt DESC'

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
    await ensureTable()
    const body = await req.json() as any
    const { storeId, name, type = 'ONBOARDING', tasks = [] } = body
    if (!storeId) return err('storeId required')
    if (!name) return err('name required')
    if (!['ONBOARDING', 'OFFBOARDING'].includes(type)) return err('type must be ONBOARDING or OFFBOARDING')

    const id = newId()
    const now = nowISO()
    await exec(
      `INSERT INTO OnboardingTemplate (id, storeId, name, type, tasks, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, storeId, name, type, JSON.stringify(tasks), now, now],
    )
    return NextResponse.json({ id }, { status: 201 })
  } catch (e: any) {
    return err(e.message, 500)
  }
}
