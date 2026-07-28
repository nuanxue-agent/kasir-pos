// PATCH /api/replenishment-suggestions/[id]  — order or dismiss a suggestion
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { exec, nowISO } from '@/lib/db'
import { ensureReplenishmentTables } from '../../replenishment-configs/route'

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
  await ensureReplenishmentTables()

  const b = (await req.json()) as any
  if (!b.status) return err("Field 'status' is required", 400, 'MISSING_FIELD')

  const validStatus = ['PENDING', 'ORDERED', 'DISMISSED']
  if (!validStatus.includes(b.status)) return err('Invalid status value', 400, 'INVALID_VALUE')

  await exec(
    `UPDATE ReplenishmentSuggestion SET status = ? WHERE id = ?`,
    [b.status, id]
  )

  return NextResponse.json({ ok: true })
}
