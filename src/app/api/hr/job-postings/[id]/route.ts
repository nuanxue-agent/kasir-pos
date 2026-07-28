import { NextRequest, NextResponse } from 'next/server'
import { query, exec, nowISO } from '@/lib/db'
import { ensureRecruitmentTables } from '../route'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    await ensureRecruitmentTables()

    const rows = await query(`SELECT * FROM JobPosting WHERE id = ?`, [id])
    if (rows.length === 0) return err('Not found', 404)
    const existing = rows[0] as any

    const b = await req.json() as any
    const title        = b.title        !== undefined ? b.title        : existing.title
    const department   = b.department   !== undefined ? b.department   : existing.department
    const type         = b.type         !== undefined ? b.type         : existing.type
    const description  = b.description  !== undefined ? b.description  : existing.description
    const requirements = b.requirements !== undefined ? b.requirements : existing.requirements
    const status       = b.status       !== undefined ? b.status       : existing.status

    const now = nowISO()
    const postedAt  = status === 'OPEN'   && !existing.postedAt  ? now : existing.postedAt
    const closedAt  = status === 'CLOSED' && !existing.closedAt  ? now : existing.closedAt

    await exec(
      `UPDATE JobPosting SET title=?, department=?, type=?, description=?, requirements=?, status=?, postedAt=?, closedAt=?, updatedAt=? WHERE id=?`,
      [title, department, type, description, requirements, status, postedAt, closedAt, now, id]
    )
    return NextResponse.json({ id })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
