import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, nowISO } from '@/lib/db'

function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status })
}
function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

// PATCH /api/competitor-products/[id]
// Body: { competitorName?, productName?, price?, url?, notes? }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)

    const { id } = await params
    const body = (await req.json()) as any
    const user = session.user as { stores?: { id: string }[] }

    // Verify ownership
    const rows = (await query(`SELECT storeId FROM CompetitorProduct WHERE id = ?`, [id])) as any[]
    if (!rows.length) return err('Not found', 404)
    const storeId: string = rows[0].storeId
    const hasAccess = user.stores?.some(s => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    const sets: string[] = []
    const vals: unknown[] = []

    if (body.competitorName !== undefined) { sets.push('competitorName = ?'); vals.push(body.competitorName.trim()) }
    if (body.productName !== undefined)    { sets.push('productName = ?');    vals.push(body.productName.trim()) }
    if (body.price !== undefined)          { sets.push('price = ?');          vals.push(Number(body.price)) }
    if (body.url !== undefined)            { sets.push('url = ?');            vals.push(body.url ?? null) }
    if (body.notes !== undefined)          { sets.push('notes = ?');          vals.push(body.notes ?? null) }
    if (body.recordedAt !== undefined)     { sets.push('recordedAt = ?');     vals.push(body.recordedAt) }

    if (!sets.length) return err('No fields to update')

    vals.push(id)
    await exec(`UPDATE CompetitorProduct SET ${sets.join(', ')} WHERE id = ?`, vals)

    return ok({ id, updated: true })
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
