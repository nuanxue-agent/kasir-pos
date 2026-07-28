import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { queryOne, exec, nowISO } from '@/lib/db'
import { ensureLabelTables } from '../../label-templates/route'

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

  await ensureLabelTables()

  const row = await queryOne(`SELECT * FROM LabelPrintJob WHERE id = ?`, [id]) as any
  if (!row) return err('Print job not found', 404, 'NOT_FOUND')

  const b = (await req.json()) as any

  const sets: string[] = []
  const vals: any[] = []

  if (b.status !== undefined) {
    const validStatuses = ['PENDING', 'PRINTED']
    if (!validStatuses.includes(b.status)) {
      return err(`Invalid status: ${b.status}`, 400, 'INVALID_FIELD')
    }
    sets.push('status = ?')
    vals.push(b.status)
  }

  if (sets.length === 0) return err('No fields to update', 400, 'MISSING_FIELD')

  sets.push('updatedAt = ?')
  vals.push(nowISO())
  vals.push(id)

  await exec(`UPDATE LabelPrintJob SET ${sets.join(', ')} WHERE id = ?`, vals)

  return NextResponse.json({ ok: true })
}
