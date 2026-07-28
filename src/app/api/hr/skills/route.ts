import { NextRequest, NextResponse } from 'next/server'
import { query, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function ensureSkillsTables() {
  await exec(`CREATE TABLE IF NOT EXISTS Skill (
    id          TEXT PRIMARY KEY,
    storeId     TEXT NOT NULL,
    name        TEXT NOT NULL,
    category    TEXT NOT NULL DEFAULT 'TECHNICAL',
    description TEXT,
    createdAt   TEXT NOT NULL,
    updatedAt   TEXT NOT NULL
  )`)

  await exec(`CREATE TABLE IF NOT EXISTS EmployeeSkill (
    id          TEXT PRIMARY KEY,
    employeeId  TEXT NOT NULL,
    skillId     TEXT NOT NULL,
    storeId     TEXT NOT NULL,
    proficiency TEXT NOT NULL DEFAULT 'BEGINNER',
    certifiedAt TEXT,
    expiresAt   TEXT,
    createdAt   TEXT NOT NULL,
    updatedAt   TEXT NOT NULL
  )`)

  await exec(`CREATE TABLE IF NOT EXISTS RoleSkillRequirement (
    id                 TEXT PRIMARY KEY,
    storeId            TEXT NOT NULL,
    role               TEXT NOT NULL,
    skillId            TEXT NOT NULL,
    requiredProficiency TEXT NOT NULL DEFAULT 'BEGINNER',
    createdAt          TEXT NOT NULL,
    updatedAt          TEXT NOT NULL
  )`)
}

export async function GET(req: NextRequest) {
  try {
    await ensureSkillsTables()
    const storeId = req.nextUrl.searchParams.get('storeId')
    if (!storeId) return err('storeId required')

    const category = req.nextUrl.searchParams.get('category')
    const rows = category
      ? await query(`SELECT * FROM Skill WHERE storeId = ? AND category = ? ORDER BY name ASC`, [storeId, category])
      : await query(`SELECT * FROM Skill WHERE storeId = ? ORDER BY category ASC, name ASC`, [storeId])

    return NextResponse.json(rows)
  } catch (e: any) {
    return err(e.message, 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureSkillsTables()
    const storeId = req.nextUrl.searchParams.get('storeId')
    if (!storeId) return err('storeId required')

    const b = (await req.json()) as any
    if (!b.name) return err("Field 'name' is required")

    const VALID_CATEGORIES = ['TECHNICAL', 'SOFT', 'OPERATIONAL', 'LEADERSHIP']
    const category = b.category ?? 'TECHNICAL'
    if (!VALID_CATEGORIES.includes(category)) return err(`category must be one of ${VALID_CATEGORIES.join(', ')}`)

    const t = nowISO()
    const id = newId()
    await exec(
      `INSERT INTO Skill (id, storeId, name, category, description, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, storeId, b.name, category, b.description ?? null, t, t],
    )
    return NextResponse.json({ id }, { status: 201 })
  } catch (e: any) {
    return err(e.message, 500)
  }
}
