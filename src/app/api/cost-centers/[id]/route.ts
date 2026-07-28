// PATCH /api/cost-centers/[id]
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { exec, nowISO } from '@/lib/db'
import { ensureCostCenterTables } from '../route'

function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)

    const { id } = await params
    await ensureCostCenterTables()

    const b = (await req.json()) as any

    const sets: string[] = []
    const vals: any[] = []

    if (b.name !== undefined)       { sets.push('name = ?');       vals.push(b.name) }
    if (b.type !== undefined)       { sets.push('type = ?');       vals.push(b.type) }
    if (b.budget !== undefined)     { sets.push('budget = ?');     vals.push(Number(b.budget)) }
    if (b.actualCost !== undefined) { sets.push('actualCost = ?'); vals.push(Number(b.actualCost)) }
    if (b.period !== undefined)     { sets.push('period = ?');     vals.push(b.period) }

    if (sets.length === 0) return err('No fields to update')

    sets.push('updatedAt = ?')
    vals.push(nowISO())
    vals.push(id)

    await exec(`UPDATE CostCenter SET ${sets.join(', ')} WHERE id = ?`, vals)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500)
  }
}
