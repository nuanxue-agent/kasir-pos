import { NextRequest, NextResponse } from 'next/server'
import { query, exec, newId, nowISO } from '@/lib/db'

export async function ensureRecruitmentTables() {
  await exec(`CREATE TABLE IF NOT EXISTS JobPosting (
    id TEXT PRIMARY KEY,
    storeId TEXT NOT NULL,
    title TEXT NOT NULL,
    department TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'FULL_TIME',
    description TEXT NOT NULL DEFAULT '',
    requirements TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'DRAFT',
    postedAt TEXT,
    closedAt TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS Applicant (
    id TEXT PRIMARY KEY,
    jobId TEXT NOT NULL,
    storeId TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    resumeUrl TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'NEW',
    notes TEXT NOT NULL DEFAULT '',
    appliedAt TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`)
}

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function GET(req: NextRequest) {
  try {
    await ensureRecruitmentTables()
    const sp = req.nextUrl.searchParams
    const storeId = sp.get('storeId')
    const status = sp.get('status')
    if (!storeId) return err('storeId required')

    let sql = `SELECT * FROM JobPosting WHERE storeId = ?`
    const params: any[] = [storeId]
    if (status) { sql += ' AND status = ?'; params.push(status) }
    sql += ' ORDER BY createdAt DESC'

    const rows = await query(sql, params)
    return NextResponse.json({ data: rows })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureRecruitmentTables()
    const b = await req.json() as any
    const { storeId, title, department, type = 'FULL_TIME', description = '', requirements = '', status = 'DRAFT' } = b

    if (!storeId || !title || !department) {
      return err('storeId, title, and department are required')
    }

    const id = newId()
    const now = nowISO()
    const postedAt = status === 'OPEN' ? now : null

    await exec(
      `INSERT INTO JobPosting (id, storeId, title, department, type, description, requirements, status, postedAt, closedAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, storeId, title, department, type, description, requirements, status, postedAt, null, now, now]
    )
    return NextResponse.json({ id }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
