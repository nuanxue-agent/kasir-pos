// PATCH /api/qc-inspections/[id]
import { NextRequest, NextResponse } from 'next/server'
import { query, exec, nowISO } from '@/lib/db'
import { ensureQCTables } from '../route'

function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

const VALID_STATUSES = ['PENDING', 'PASSED', 'FAILED', 'PARTIAL']

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await ensureQCTables()
    const { id } = await params
    const body = (await req.json()) as any
    const { status, passQty, failQty, notes, inspectedBy } = body

    if (status && !VALID_STATUSES.includes(status)) {
      return err(`status must be one of: ${VALID_STATUSES.join(', ')}`)
    }
    if (passQty != null && Number(passQty) < 0) return err('passQty must be >= 0')
    if (failQty != null && Number(failQty) < 0) return err('failQty must be >= 0')

    const rows = await query(`SELECT * FROM QCInspection WHERE id = ?`, [id]) as any[]
    const insp = rows[0]
    if (!insp) return err('Inspection not found', 404)

    const now = nowISO()
    await exec(
      `UPDATE QCInspection
       SET status      = COALESCE(?, status),
           passQty     = COALESCE(?, passQty),
           failQty     = COALESCE(?, failQty),
           notes       = COALESCE(?, notes),
           inspectedBy = COALESCE(?, inspectedBy),
           updatedAt   = ?
       WHERE id = ?`,
      [
        status ?? null,
        passQty != null ? Number(passQty) : null,
        failQty != null ? Number(failQty) : null,
        notes ?? null,
        inspectedBy ?? null,
        now,
        id,
      ]
    )
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return err(e.message, 500)
  }
}
