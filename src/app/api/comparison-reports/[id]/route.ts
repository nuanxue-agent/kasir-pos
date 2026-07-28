import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec } from '@/lib/db'

function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status })
}
function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

// PATCH /api/comparison-reports/[id]
// Body: { priceDiff?, priceDiffPct?, advantage? }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)

    const { id } = await params
    const body = (await req.json()) as any
    const user = session.user as { stores?: { id: string }[] }

    const rows = (await query(`SELECT storeId FROM ComparisonReport WHERE id = ?`, [id])) as any[]
    if (!rows.length) return err('Not found', 404)
    const storeId: string = rows[0].storeId
    const hasAccess = user.stores?.some(s => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    const validAdvantages = ['CHEAPER', 'COMPETITIVE', 'EXPENSIVE']

    const sets: string[] = []
    const vals: unknown[] = []

    if (body.priceDiff !== undefined)    { sets.push('priceDiff = ?');    vals.push(Number(body.priceDiff)) }
    if (body.priceDiffPct !== undefined) { sets.push('priceDiffPct = ?'); vals.push(Number(body.priceDiffPct)) }
    if (body.advantage !== undefined) {
      if (!validAdvantages.includes(body.advantage)) return err('advantage must be CHEAPER, COMPETITIVE, or EXPENSIVE')
      sets.push('advantage = ?')
      vals.push(body.advantage)
    }

    if (!sets.length) return err('No fields to update')

    vals.push(id)
    await exec(`UPDATE ComparisonReport SET ${sets.join(', ')} WHERE id = ?`, vals)

    return ok({ id, updated: true })
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
