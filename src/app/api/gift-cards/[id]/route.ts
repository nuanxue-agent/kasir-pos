import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, nowISO } from '@/lib/db'
import { ensureTables } from '../route'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

// PATCH /api/gift-cards/[id]
// Body: { status?, expiresAt?, issuedTo? }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)

    const { id } = await params
    await ensureTables()

    const rows = await query(`SELECT * FROM GiftCard WHERE id = ?`, [id])
    if (rows.length === 0) return err('Not found', 404)
    const card = rows[0] as any

    const b = (await req.json()) as any
    const VALID_STATUSES = ['ACTIVE', 'REDEEMED', 'EXPIRED', 'VOIDED']

    const sets: string[] = []
    const vals: any[] = []

    if (b.status !== undefined) {
      if (!VALID_STATUSES.includes(b.status)) return err(`Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`)
      if (card.status === 'VOIDED') return err('Cannot update a voided card')
      sets.push('status = ?'); vals.push(b.status)
    }
    if (b.expiresAt !== undefined) { sets.push('expiresAt = ?'); vals.push(b.expiresAt) }
    if (b.issuedTo !== undefined)  { sets.push('issuedTo = ?');  vals.push(b.issuedTo) }

    if (sets.length === 0) return err('No fields to update')

    sets.push('updatedAt = ?'); vals.push(nowISO()); vals.push(id)
    await exec(`UPDATE GiftCard SET ${sets.join(', ')} WHERE id = ?`, vals)
    return ok({ ok: true })
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
