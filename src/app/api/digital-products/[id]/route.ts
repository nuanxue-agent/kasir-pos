import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, nowISO } from '@/lib/db'
import { ensureTables } from '../route'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

// PATCH /api/digital-products/[id]
// Body: { name?, category?, denomination?, price?, margin?, provider?, active? }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)

    const { id } = await params

    await ensureTables()

    const rows = await query(`SELECT * FROM DigitalProduct WHERE id = ?`, [id])
    if (rows.length === 0) return err('Not found', 404)

    const b = (await req.json()) as any
    const VALID_CATEGORIES = ['TOPUP', 'EVOUCHER', 'GAME_CREDIT', 'INTERNET', 'ELECTRICITY']

    const sets: string[] = []
    const vals: any[] = []

    if (b.name !== undefined)        { sets.push('name = ?');        vals.push(b.name) }
    if (b.category !== undefined) {
      if (!VALID_CATEGORIES.includes(b.category)) return err(`Invalid category`)
      sets.push('category = ?'); vals.push(b.category)
    }
    if (b.denomination !== undefined) { sets.push('denomination = ?'); vals.push(Number(b.denomination)) }
    if (b.price !== undefined)        { sets.push('price = ?');        vals.push(Number(b.price)) }
    if (b.margin !== undefined)       { sets.push('margin = ?');       vals.push(Number(b.margin)) }
    if (b.provider !== undefined)     { sets.push('provider = ?');     vals.push(b.provider) }
    if (b.active !== undefined)       { sets.push('active = ?');       vals.push(b.active ? 1 : 0) }

    if (sets.length === 0) return err('No fields to update')

    sets.push('updatedAt = ?'); vals.push(nowISO()); vals.push(id)

    await exec(`UPDATE DigitalProduct SET ${sets.join(', ')} WHERE id = ?`, vals)
    return ok({ ok: true })
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
