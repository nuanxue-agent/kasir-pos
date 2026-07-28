// PATCH /api/product-costs/[id]
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { exec, nowISO } from '@/lib/db'
import { ensureProductCostTables } from '../route'

function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)

    const { id } = await params
    await ensureProductCostTables()

    const b = (await req.json()) as any

    const sets: string[] = []
    const vals: any[] = []

    if (b.materialCost !== undefined) { sets.push('materialCost = ?'); vals.push(Number(b.materialCost)) }
    if (b.laborCost !== undefined)    { sets.push('laborCost = ?');    vals.push(Number(b.laborCost)) }
    if (b.overheadCost !== undefined) { sets.push('overheadCost = ?'); vals.push(Number(b.overheadCost)) }
    if (b.effectiveDate !== undefined){ sets.push('effectiveDate = ?'); vals.push(b.effectiveDate) }
    if (b.notes !== undefined)        { sets.push('notes = ?');        vals.push(b.notes) }

    if (sets.length === 0) return err('No fields to update')

    // Recalculate totalCost if any cost component changed
    sets.push('totalCost = materialCost + laborCost + overheadCost')
    sets.push('updatedAt = ?')
    vals.push(nowISO())
    vals.push(id)

    await exec(`UPDATE ProductCost SET ${sets.join(', ')} WHERE id = ?`, vals)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500)
  }
}
