import { NextRequest, NextResponse } from 'next/server'
import { query, exec, newId, nowISO } from '@/lib/db'
import { ensureSkillsTables } from '../skills/route'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function GET(req: NextRequest) {
  try {
    await ensureSkillsTables()
    const storeId = req.nextUrl.searchParams.get('storeId')
    if (!storeId) return err('storeId required')

    const employeeId = req.nextUrl.searchParams.get('employeeId')

    const rows = employeeId
      ? await query(
          `SELECT es.*, s.name as skillName, s.category as skillCategory
           FROM EmployeeSkill es
           JOIN Skill s ON es.skillId = s.id
           WHERE es.storeId = ? AND es.employeeId = ?
           ORDER BY s.category ASC, s.name ASC`,
          [storeId, employeeId],
        )
      : await query(
          `SELECT es.*, s.name as skillName, s.category as skillCategory
           FROM EmployeeSkill es
           JOIN Skill s ON es.skillId = s.id
           WHERE es.storeId = ?
           ORDER BY es.employeeId ASC, s.category ASC, s.name ASC`,
          [storeId],
        )

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
    if (!b.employeeId || !b.skillId) return err('employeeId and skillId are required')

    const VALID_PROFICIENCY = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT']
    const proficiency = b.proficiency ?? 'BEGINNER'
    if (!VALID_PROFICIENCY.includes(proficiency)) {
      return err(`proficiency must be one of ${VALID_PROFICIENCY.join(', ')}`)
    }

    // Check if already exists
    const existing = await query(
      `SELECT id FROM EmployeeSkill WHERE storeId = ? AND employeeId = ? AND skillId = ?`,
      [storeId, b.employeeId, b.skillId],
    )
    if (existing.length > 0) return err('Employee already has this skill')

    const t = nowISO()
    const id = newId()
    await exec(
      `INSERT INTO EmployeeSkill (id, employeeId, skillId, storeId, proficiency, certifiedAt, expiresAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, b.employeeId, b.skillId, storeId, proficiency, b.certifiedAt ?? null, b.expiresAt ?? null, t, t],
    )
    return NextResponse.json({ id }, { status: 201 })
  } catch (e: any) {
    return err(e.message, 500)
  }
}
