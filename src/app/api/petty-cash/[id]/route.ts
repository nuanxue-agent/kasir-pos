// PATCH /api/petty-cash/[id] — update fund metadata
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { exec, nowISO } from '@/lib/db'
import { ensurePettyCashTables } from '../route'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)

    const { id } = await params
    await ensurePettyCashTables()

    const b = (await req.json()) as any

    const sets: string[] = []
    const vals: any[] = []

    if (b.name !== undefined)       { sets.push('name = ?');       vals.push(b.name) }
    if (b.maxBalance !== undefined) { sets.push('maxBalance = ?'); vals.push(Number(b.maxBalance)) }
    if (b.custodian !== undefined)  { sets.push('custodian = ?');  vals.push(b.custodian) }
    if (b.active !== undefined)     { sets.push('active = ?');     vals.push(b.active ? 1 : 0) }

    if (sets.length === 0) return err('No fields to update')

    sets.push('updatedAt = ?')
    vals.push(nowISO())
    vals.push(id)

    await exec(`UPDATE PettyCashFund SET ${sets.join(', ')} WHERE id = ?`, vals)
    return ok({ ok: true })
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500)
  }
}
