import { NextRequest, NextResponse } from 'next/server'
import { query, exec, newId, nowISO } from '@/lib/db'
import { ensureGrievanceTables } from '../../route'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await ensureGrievanceTables()
    const { id } = await params
    const { searchParams } = new URL(req.url)
    const storeId = searchParams.get('storeId')
    if (!storeId) return err('storeId required')

    const grievances = await query(`SELECT id FROM Grievance WHERE id = ? AND storeId = ?`, [id, storeId]) as any[]
    if (!grievances[0]) return err('Grievance not found', 404)

    const notes = await query(
      `SELECT * FROM GrievanceNote WHERE grievanceId = ? ORDER BY createdAt ASC`,
      [id],
    )
    return NextResponse.json({ data: notes })
  } catch (e: any) {
    return err(e.message, 500)
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await ensureGrievanceTables()
    const { id } = await params
    const body = await req.json() as any
    const { storeId, authorId, note } = body

    if (!storeId || !authorId || !note?.trim()) {
      return err('storeId, authorId, note required')
    }

    const grievances = await query(`SELECT id FROM Grievance WHERE id = ? AND storeId = ?`, [id, storeId]) as any[]
    if (!grievances[0]) return err('Grievance not found', 404)

    const noteId = newId()
    const now = nowISO()
    await exec(
      `INSERT INTO GrievanceNote (id, grievanceId, storeId, authorId, note, createdAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [noteId, id, storeId, authorId, note.trim(), now],
    )
    return NextResponse.json({ id: noteId }, { status: 201 })
  } catch (e: any) {
    return err(e.message, 500)
  }
}
