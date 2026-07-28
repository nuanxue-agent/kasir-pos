// GET/POST /api/qc-inspections/[id]/checkpoints
import { NextRequest, NextResponse } from 'next/server'
import { query, exec, newId, nowISO } from '@/lib/db'
import { ensureQCTables } from '../../route'

function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

const VALID_RESULTS = ['PASS', 'FAIL', 'NA']

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await ensureQCTables()
    const { id } = await params
    const { searchParams } = new URL(req.url)
    const storeId = searchParams.get('storeId')
    if (!storeId) return err('storeId required')

    const rows = await query(`SELECT id FROM QCInspection WHERE id = ? AND storeId = ?`, [id, storeId]) as any[]
    if (!rows[0]) return err('Inspection not found', 404)

    const checkpoints = await query(
      `SELECT * FROM QCCheckpoint WHERE inspectionId = ? ORDER BY createdAt ASC`,
      [id],
    )
    return NextResponse.json({ data: checkpoints })
  } catch (e: any) {
    return err(e.message, 500)
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await ensureQCTables()
    const { id } = await params
    const body = (await req.json()) as any
    const { storeId, criterion, result, value, threshold, notes } = body

    if (!storeId) return err('storeId required')
    if (!criterion?.trim()) return err('criterion required')
    if (result && !VALID_RESULTS.includes(result)) {
      return err(`result must be one of: ${VALID_RESULTS.join(', ')}`)
    }

    const rows = await query(`SELECT id FROM QCInspection WHERE id = ? AND storeId = ?`, [id, storeId]) as any[]
    if (!rows[0]) return err('Inspection not found', 404)

    const cpId = newId()
    const now = nowISO()
    await exec(
      `INSERT INTO QCCheckpoint (id, inspectionId, storeId, criterion, result, value, threshold, notes, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [cpId, id, storeId, criterion.trim(), result ?? 'NA', value ?? null, threshold ?? null, notes ?? null, now, now],
    )
    return NextResponse.json({ id: cpId }, { status: 201 })
  } catch (e: any) {
    return err(e.message, 500)
  }
}
