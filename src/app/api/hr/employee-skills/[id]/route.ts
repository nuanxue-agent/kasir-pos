import { NextRequest, NextResponse } from 'next/server'
import { query, exec, nowISO } from '@/lib/db'
import { ensureSkillsTables } from '../../skills/route'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await ensureSkillsTables()
    const { id } = await params
    const b = (await req.json()) as any

    const existing = await query(`SELECT id FROM EmployeeSkill WHERE id = ?`, [id])
    if (existing.length === 0) return err('Not found', 404)

    const VALID_PROFICIENCY = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT']
    const sets: string[] = []
    const vals: any[] = []

    if (b.proficiency !== undefined) {
      if (!VALID_PROFICIENCY.includes(b.proficiency)) {
        return err(`proficiency must be one of ${VALID_PROFICIENCY.join(', ')}`)
      }
      sets.push('proficiency = ?')
      vals.push(b.proficiency)
    }
    if (b.certifiedAt !== undefined) { sets.push('certifiedAt = ?'); vals.push(b.certifiedAt) }
    if (b.expiresAt !== undefined) { sets.push('expiresAt = ?'); vals.push(b.expiresAt) }
    if (sets.length === 0) return err('No fields to update')

    sets.push('updatedAt = ?')
    vals.push(nowISO())
    vals.push(id)

    await exec(`UPDATE EmployeeSkill SET ${sets.join(', ')} WHERE id = ?`, vals)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return err(e.message, 500)
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const existing = await query(`SELECT id FROM EmployeeSkill WHERE id = ?`, [id])
    if (existing.length === 0) return err('Not found', 404)

    await exec(`DELETE FROM EmployeeSkill WHERE id = ?`, [id])
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return err(e.message, 500)
  }
}
