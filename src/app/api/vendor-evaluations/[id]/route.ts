import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { exec, queryOne, nowISO } from '@/lib/db'
import { ensureVendorEvaluationTable } from '../route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')

  const { id } = await params

  await ensureVendorEvaluationTable()

  const existing = await queryOne(`SELECT id FROM VendorEvaluation WHERE id = ?`, [id]) as any
  if (!existing) return err('Evaluation not found', 404, 'NOT_FOUND')

  const b = (await req.json()) as any

  const sets: string[] = []
  const vals: any[] = []

  if (b.notes !== undefined) {
    sets.push('notes = ?')
    vals.push(b.notes)
  }
  if (b.orderId !== undefined) {
    sets.push('orderId = ?')
    vals.push(b.orderId)
  }

  if (sets.length === 0) return err('No fields to update', 400, 'NO_FIELDS')

  vals.push(id)
  await exec(`UPDATE VendorEvaluation SET ${sets.join(', ')} WHERE id = ?`, vals)

  return NextResponse.json({ ok: true })
}
