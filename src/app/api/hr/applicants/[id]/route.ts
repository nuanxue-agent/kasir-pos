import { NextRequest, NextResponse } from 'next/server'
import { query, exec, nowISO } from '@/lib/db'
import { ensureRecruitmentTables } from '../../job-postings/route'

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

    const rows = await query(`SELECT * FROM Applicant WHERE id = ?`, [id])
    if (rows.length === 0) return err('Not found', 404)
    const existing = rows[0] as any

    const b = await req.json() as any
    const status    = b.status    !== undefined ? b.status    : existing.status
    const notes     = b.notes     !== undefined ? b.notes     : existing.notes
    const resumeUrl = b.resumeUrl !== undefined ? b.resumeUrl : existing.resumeUrl
    const phone     = b.phone     !== undefined ? b.phone     : existing.phone

    const now = nowISO()
    await exec(
      `UPDATE Applicant SET status=?, notes=?, resumeUrl=?, phone=?, updatedAt=? WHERE id=?`,
      [status, notes, resumeUrl, phone, now, id]
    )
    return NextResponse.json({ id })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
