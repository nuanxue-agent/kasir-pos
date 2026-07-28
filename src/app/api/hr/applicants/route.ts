import { NextRequest, NextResponse } from 'next/server'
import { query, exec, newId, nowISO } from '@/lib/db'
import { ensureRecruitmentTables } from '../job-postings/route'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function GET(req: NextRequest) {
  try {
    await ensureRecruitmentTables()
    const sp = req.nextUrl.searchParams
    const storeId = sp.get('storeId')
    const jobId   = sp.get('jobId')
    const status  = sp.get('status')
    if (!storeId) return err('storeId required')

    let sql = `SELECT a.*, j.title as jobTitle
      FROM Applicant a
      LEFT JOIN JobPosting j ON j.id = a.jobId
      WHERE a.storeId = ?`
    const params: any[] = [storeId]
    if (jobId)  { sql += ' AND a.jobId = ?';  params.push(jobId) }
    if (status) { sql += ' AND a.status = ?'; params.push(status) }
    sql += ' ORDER BY a.appliedAt DESC'

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
    const { storeId, jobId, name, email, phone = '', resumeUrl = '', notes = '' } = b

    if (!storeId || !jobId || !name || !email) {
      return err('storeId, jobId, name, and email are required')
    }

    const id = newId()
    const now = nowISO()

    await exec(
      `INSERT INTO Applicant (id, jobId, storeId, name, email, phone, resumeUrl, status, notes, appliedAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'NEW', ?, ?, ?, ?)`,
      [id, jobId, storeId, name, email, phone, resumeUrl, notes, now, now, now]
    )
    return NextResponse.json({ id }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
